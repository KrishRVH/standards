# Cross-compiles on Linux with clang-cl and lld-link against an xwin splat of
# the MSVC CRT and Windows SDK, so CMake takes the template's MSVC branch.
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR AMD64)

if(NOT PROJECT_MSVC_SYSROOT)
  message(FATAL_ERROR
    "Set PROJECT_MSVC_SYSROOT to an xwin splat made with --use-winsysroot-style")
endif()
list(APPEND CMAKE_TRY_COMPILE_PLATFORM_VARIABLES PROJECT_MSVC_SYSROOT)

set(CMAKE_CXX_COMPILER clang-cl)
# An explicit target also keeps clang from loading a host triple's config file.
set(CMAKE_CXX_COMPILER_TARGET x86_64-pc-windows-msvc)

# xwin omits the non-redistributable debug CRT, so every configuration links
# the release DLL runtime.
set(CMAKE_MSVC_RUNTIME_LIBRARY MultiThreadedDLL)

set(CMAKE_CXX_FLAGS_INIT "/winsysroot \"${PROJECT_MSVC_SYSROOT}\"")
foreach(kind IN ITEMS EXE SHARED MODULE)
  set(CMAKE_${kind}_LINKER_FLAGS_INIT "/winsysroot:\"${PROJECT_MSVC_SYSROOT}\"")
endforeach()
