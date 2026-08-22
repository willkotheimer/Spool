// Windows clipboard listener (PLAN.md 8).
//
// Electron's clipboard module reads and writes but does not notify, so there is no change event to
// subscribe to from JavaScript. This wraps AddClipboardFormatListener, which is event-driven, needs
// no polling, and — decisively — can enumerate the clipboard's formats, which is the only way the
// Tier 1 concealed-clipboard markers of PLAN.md 4 can be seen at all.
//
// Deliberately NOT SetClipboardViewer: that builds a chain which breaks whenever any application in
// it misbehaves.
//
// Content comes back as a Buffer rather than a string. A JavaScript string cannot be wiped — it is
// immutable and garbage-collected — so a declined secret that ever became one stays in the heap
// (PLAN.md 4, "Wiping a declined clip"). Handing back bytes is what keeps that option open.

#include <napi.h>
#include <windows.h>

#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace {

struct ClipboardEvent {
  std::vector<std::string> formats;
  std::vector<uint8_t> text;  // UTF-8 bytes of the plain-text flavour, empty when there is none.
  bool has_text = false;
  std::string source_app;
};

std::string ToUtf8(const std::wstring& wide) {
  if (wide.empty()) return std::string();

  int size = WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0,
                                 nullptr, nullptr);
  std::string utf8(static_cast<size_t>(size), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), utf8.data(), size,
                      nullptr, nullptr);
  return utf8;
}

/** The standard formats, which have no name to ask the OS for. */
const char* StandardFormatName(UINT format) {
  switch (format) {
    case CF_TEXT: return "CF_TEXT";
    case CF_BITMAP: return "CF_BITMAP";
    case CF_METAFILEPICT: return "CF_METAFILEPICT";
    case CF_SYLK: return "CF_SYLK";
    case CF_DIF: return "CF_DIF";
    case CF_TIFF: return "CF_TIFF";
    case CF_OEMTEXT: return "CF_OEMTEXT";
    case CF_DIB: return "CF_DIB";
    case CF_PALETTE: return "CF_PALETTE";
    case CF_PENDATA: return "CF_PENDATA";
    case CF_RIFF: return "CF_RIFF";
    case CF_WAVE: return "CF_WAVE";
    case CF_UNICODETEXT: return "CF_UNICODETEXT";
    case CF_ENHMETAFILE: return "CF_ENHMETAFILE";
    case CF_HDROP: return "CF_HDROP";
    case CF_LOCALE: return "CF_LOCALE";
    case CF_DIBV5: return "CF_DIBV5";
    default: return nullptr;
  }
}

/** The application that owns the copy, where the OS is willing to say (PLAN.md 11, M3). */
std::string SourceApplication() {
  HWND owner = GetClipboardOwner();
  if (owner == nullptr) return std::string();

  DWORD pid = 0;
  GetWindowThreadProcessId(owner, &pid);
  if (pid == 0) return std::string();

  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (process == nullptr) return std::string();

  wchar_t path[MAX_PATH] = {0};
  DWORD size = MAX_PATH;
  std::string name;
  if (QueryFullProcessImageNameW(process, 0, path, &size) != 0) {
    std::wstring full(path, size);
    size_t slash = full.find_last_of(L"\\/");
    name = ToUtf8(slash == std::wstring::npos ? full : full.substr(slash + 1));
  }
  CloseHandle(process);
  return name;
}

/**
 * Read everything of interest in one clipboard open.
 *
 * **The clipboard is a shared resource with one owner at a time, and the application that just
 * copied may still be finishing.** Opening it the instant WM_CLIPBOARDUPDATE arrives makes *their*
 * copy fail — measured: PowerShell's `Clipboard::SetText` throws "Requested Clipboard operation did
 * not succeed" whenever this listener races it. A clipboard manager that breaks copying in other
 * applications is worse than no clipboard manager, so:
 *
 *   - the read is deferred by a short timer rather than done in the message handler,
 *   - the clipboard is held only long enough to copy bytes out — no conversion, no process lookup,
 *   - and a failed open backs off and retries rather than spinning.
 */
bool ReadClipboard(ClipboardEvent* event) {
  std::wstring wide_text;
  bool opened = false;

  for (int attempt = 0; attempt < 8 && !opened; ++attempt) {
    if (!OpenClipboard(nullptr)) {
      Sleep(25);
      continue;
    }
    opened = true;

    UINT format = 0;
    while ((format = EnumClipboardFormats(format)) != 0) {
      const char* standard = StandardFormatName(format);
      if (standard != nullptr) {
        event->formats.emplace_back(standard);
        continue;
      }
      wchar_t name[256] = {0};
      int length = GetClipboardFormatNameW(format, name, 256);
      if (length > 0) event->formats.emplace_back(ToUtf8(std::wstring(name, length)));
    }

    HANDLE handle = GetClipboardData(CF_UNICODETEXT);
    if (handle != nullptr) {
      auto* locked = static_cast<wchar_t*>(GlobalLock(handle));
      if (locked != nullptr) {
        wide_text.assign(locked);  // A copy, so the conversion happens after the handle is released.
        event->has_text = true;
        GlobalUnlock(handle);
      }
    }

    CloseClipboard();
  }

  if (!opened) return false;

  // Both of these are done with the clipboard closed: neither needs it open, and holding it while
  // converting several megabytes is what makes another application's copy fail.
  if (event->has_text) {
    std::string utf8 = ToUtf8(wide_text);
    event->text.assign(utf8.begin(), utf8.end());
  }
  event->source_app = SourceApplication();

  return true;
}

class Listener {
 public:
  Listener(Napi::Env env, Napi::Function callback)
      : tsfn_(Napi::ThreadSafeFunction::New(env, callback, "spool-clipboard", 0, 1)) {
    thread_ = std::thread([this] { Run(); });
  }

  ~Listener() { Stop(); }

  void Stop() {
    if (stopped_) return;
    stopped_ = true;

    if (window_ != nullptr) PostMessageW(window_, WM_CLOSE, 0, 0);
    if (thread_.joinable()) thread_.join();
    tsfn_.Release();
  }

 private:
  void Run() {
    // A message-only window: no pixels, no taskbar presence, just a target for WM_CLIPBOARDUPDATE.
    WNDCLASSEXW description = {};
    description.cbSize = sizeof(description);
    description.lpfnWndProc = &Listener::WindowProc;
    description.hInstance = GetModuleHandleW(nullptr);
    description.lpszClassName = L"SpoolClipboardListener";
    RegisterClassExW(&description);

    window_ = CreateWindowExW(0, L"SpoolClipboardListener", L"Spool", 0, 0, 0, 0, 0, HWND_MESSAGE,
                              nullptr, GetModuleHandleW(nullptr), nullptr);
    if (window_ == nullptr) return;

    SetWindowLongPtrW(window_, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
    AddClipboardFormatListener(window_);

    MSG message;
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
      TranslateMessage(&message);
      DispatchMessageW(&message);
    }

    RemoveClipboardFormatListener(window_);
    DestroyWindow(window_);
    window_ = nullptr;
  }

  /** Long enough to let the copying application finish, short enough to feel immediate. */
  static const UINT_PTR kReadTimer = 1;
  static const UINT kReadDelayMs = 60;

  static LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM w, LPARAM l) {
    if (message == WM_CLIPBOARDUPDATE) {
      // Deferred, not handled here: see ReadClipboard. Re-arming the timer also coalesces a burst
      // of updates from one copy into a single read.
      SetTimer(window, kReadTimer, kReadDelayMs, nullptr);
      return 0;
    }
    if (message == WM_TIMER && w == kReadTimer) {
      KillTimer(window, kReadTimer);
      auto* self = reinterpret_cast<Listener*>(GetWindowLongPtrW(window, GWLP_USERDATA));
      if (self != nullptr) self->Deliver();
      return 0;
    }
    if (message == WM_CLOSE) {
      PostQuitMessage(0);
      return 0;
    }
    return DefWindowProcW(window, message, w, l);
  }

  void Deliver() {
    auto event = std::make_unique<ClipboardEvent>();
    if (!ReadClipboard(event.get())) return;

    ClipboardEvent* raw = event.release();
    tsfn_.BlockingCall(raw, [](Napi::Env env, Napi::Function callback, ClipboardEvent* data) {
      std::unique_ptr<ClipboardEvent> owned(data);

      Napi::Array formats = Napi::Array::New(env, owned->formats.size());
      for (size_t i = 0; i < owned->formats.size(); ++i) {
        formats.Set(i, Napi::String::New(env, owned->formats[i]));
      }

      Napi::Object snapshot = Napi::Object::New(env);
      snapshot.Set("formats", formats);
      snapshot.Set("text", owned->has_text
                               ? Napi::Buffer<uint8_t>::Copy(env, owned->text.data(),
                                                             owned->text.size())
                                     .As<Napi::Value>()
                               : env.Null());
      snapshot.Set("sourceApp", owned->source_app.empty()
                                    ? env.Null()
                                    : Napi::String::New(env, owned->source_app).As<Napi::Value>());

      callback.Call({snapshot});
    });
  }

  Napi::ThreadSafeFunction tsfn_;
  std::thread thread_;
  HWND window_ = nullptr;
  bool stopped_ = false;
};

std::unique_ptr<Listener> listener;

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "start(callback) requires a function").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (listener) return env.Undefined();

  listener = std::make_unique<Listener>(env, info[0].As<Napi::Function>());
  return env.Undefined();
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  if (listener) {
    listener->Stop();
    listener.reset();
  }
  return info.Env().Undefined();
}

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  return exports;
}

}  // namespace

NODE_API_MODULE(spool_clipboard, Init)
