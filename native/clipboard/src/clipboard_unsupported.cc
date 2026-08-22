// The non-Windows build of the clipboard listener.
//
// macOS gets a real implementation at M14 — NSPasteboard's changeCount and
// org.nspasteboard.ConcealedType — and neither platform's implementation is portable to the other
// (PLAN.md 8). Until then this compiles and reports itself unsupported, so the build stays green on
// every runner instead of the project being buildable on one operating system.

#include <napi.h>

namespace {

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Error::New(info.Env(), "Clipboard watching is not implemented on this platform yet")
      .ThrowAsJavaScriptException();
  return info.Env().Undefined();
}

Napi::Value Stop(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), false);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  return exports;
}

}  // namespace

NODE_API_MODULE(spool_clipboard, Init)
