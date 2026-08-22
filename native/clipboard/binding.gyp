{
  "targets": [
    {
      "target_name": "spool_clipboard",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "conditions": [
        [
          "OS=='win'",
          {
            "sources": ["src/clipboard_win.cc"],
            "libraries": ["-luser32.lib"],
            "msvs_settings": {
              "VCCLCompilerTool": { "ExceptionHandling": 1 }
            }
          },
          {
            # Every other platform builds a stub that reports itself unsupported. macOS gets a real
            # implementation at M14; until then the build has to stay green everywhere so CI can
            # run on more than one runner (PLAN.md 11, M14).
            "sources": ["src/clipboard_unsupported.cc"],
            "cflags_cc": ["-std=c++17"]
          }
        ]
      ]
    }
  ]
}
