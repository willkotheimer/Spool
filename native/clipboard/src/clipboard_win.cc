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
  // The value of CanIncludeInClipboardHistory, when the clipboard carried it. Zero means the
  // source application asked to be kept out of clipboard history — which is what this app is, so
  // PLAN.md 4 treats it as a Tier 1 declaration. The *value* matters: applications also set it to
  // one to say the opposite, so the format's presence alone would be the wrong signal.
  int32_t can_include_in_history = -1;
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

    // Read the concealment declaration while the clipboard is open (PLAN.md 4, Tier 1).
    UINT history_format = RegisterClipboardFormatW(L"CanIncludeInClipboardHistory");
    if (history_format != 0) {
      HANDLE history = GetClipboardData(history_format);
      if (history != nullptr) {
        auto* value = static_cast<DWORD*>(GlobalLock(history));
        if (value != nullptr) {
          event->can_include_in_history = static_cast<int32_t>(*value);
          GlobalUnlock(history);
        }
      }
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
      // Null when the clipboard did not carry the format at all, which is the common case and is
      // not a declaration either way (PLAN.md 4, Tier 1).
      snapshot.Set("canIncludeInClipboardHistory",
                   owned->can_include_in_history < 0
                       ? env.Null()
                       : Napi::Number::New(env, owned->can_include_in_history).As<Napi::Value>());

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

// Synthesize Ctrl+V into whatever window has focus (PLAN.md 8).
//
// This is *output*, not input: SendInput asks Windows to deliver a keystroke, and needs no
// permission, no elevation, and no keyboard hook. That distinction is the whole reason it is
// acceptable here. The macOS equivalent would require Accessibility permission, which is permission
// to read every keystroke on the machine, and an app whose claim is that it cannot spy on you must
// not ask for it — so this stays a Windows-only capability rather than a cross-platform one.
//
// It refuses when Spool itself is in front. Serving is meant to put a clip into the document you
// were already working in; pasting into our own window would type the clip into the app that just
// produced it, which is never what anyone meant.
Napi::Value SendPaste(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  HWND foreground = GetForegroundWindow();
  if (foreground == nullptr) return Napi::Boolean::New(env, false);

  DWORD foreground_pid = 0;
  GetWindowThreadProcessId(foreground, &foreground_pid);
  if (foreground_pid == GetCurrentProcessId()) return Napi::Boolean::New(env, false);

  // **Release whatever the user is still holding first.**
  //
  // The hotkey that asked for this paste fires on the key *down*, so at this instant Win and Alt
  // are almost certainly still held — the user has not let go of `Win+Alt+U` yet. Synthesizing
  // Ctrl+V into that state delivers `Win+Alt+Ctrl+V`, which is not a paste in any application, and
  // nothing happens. It cost a user their trust in the feature before it was understood, and it
  // looked intermittent because a handler that happened to run after the keys came up worked fine.
  //
  // So: lift every modifier that is currently down, then press Ctrl+V cleanly. They are not
  // restored afterwards. The user's own keys are still physically held and their next release is
  // harmless, whereas re-pressing Win here would open the Start menu.
  const WORD kModifiers[] = {VK_LWIN,   VK_RWIN,   VK_LMENU,    VK_RMENU,
                             VK_LSHIFT, VK_RSHIFT, VK_LCONTROL, VK_RCONTROL};

  std::vector<INPUT> inputs;
  for (WORD vk : kModifiers) {
    if ((GetAsyncKeyState(vk) & 0x8000) == 0) continue;
    INPUT up = {};
    up.type = INPUT_KEYBOARD;
    up.ki.wVk = vk;
    up.ki.dwFlags = KEYEVENTF_KEYUP;
    inputs.push_back(up);
  }

  const size_t released = inputs.size();

  INPUT press = {};
  press.type = INPUT_KEYBOARD;
  press.ki.wVk = VK_CONTROL;
  inputs.push_back(press);

  press.ki.wVk = 'V';
  inputs.push_back(press);

  INPUT release = {};
  release.type = INPUT_KEYBOARD;
  release.ki.dwFlags = KEYEVENTF_KEYUP;
  release.ki.wVk = 'V';
  inputs.push_back(release);

  release.ki.wVk = VK_CONTROL;
  inputs.push_back(release);

  const UINT expected = static_cast<UINT>(released + 4);
  const UINT sent = SendInput(expected, inputs.data(), sizeof(INPUT));
  return Napi::Boolean::New(env, sent == expected);
}

// Whether Spool's own window is the one in front.
//
// Asked before serving, because it decides where the clip is meant to go. If we are in front, the
// window has to get out of the way first: the user is looking at Spool, but the clip is for
// whatever they were working in before they opened it.
Napi::Value ForegroundIsSelf(const Napi::CallbackInfo& info) {
  HWND foreground = GetForegroundWindow();
  if (foreground == nullptr) return Napi::Boolean::New(info.Env(), false);

  DWORD foreground_pid = 0;
  GetWindowThreadProcessId(foreground, &foreground_pid);
  return Napi::Boolean::New(info.Env(), foreground_pid == GetCurrentProcessId());
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("sendPaste", Napi::Function::New(env, SendPaste));
  exports.Set("foregroundIsSelf", Napi::Function::New(env, ForegroundIsSelf));
  return exports;
}

}  // namespace

NODE_API_MODULE(spool_clipboard, Init)
