#if !defined(_WIN32_WINNT) || _WIN32_WINNT != 0x0A00
#error "the win32 profile must declare the Windows 10 API floor"
#endif

#if !defined(WINVER) || WINVER != 0x0A00
#error "the win32 profile must keep WINVER consistent with _WIN32_WINNT"
#endif

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

int main(void)
{
    FILETIME now = { 0 };
    GetSystemTimePreciseAsFileTime(&now);
    return now.dwLowDateTime == 0 && now.dwHighDateTime == 0 ? 1 : 0;
}
