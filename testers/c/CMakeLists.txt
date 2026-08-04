cmake_minimum_required(VERSION 3.20)
project(c_project VERSION 0.1.0 LANGUAGES C)

include(CMakePackageConfigHelpers)
include(GenerateExportHeader)
include(GNUInstallDirs)
include(CTest)
include(cmake/ProjectCStandards.cmake)

option(PROJECT_WERROR "Treat the reviewed compiler warnings as errors" ON)
option(PROJECT_BUILD_CLI "Build the CLI executable" ON)
option(PROJECT_BUILD_SHARED "Build a shared library in addition to the static library" OFF)
option(PROJECT_INSTALL "Install library and headers" OFF)
option(PROJECT_ALLOW_UNVERIFIED_COMPILER
       "Configure without the strict warning policy on an unsupported compiler" OFF)

set(PROJECT_PLATFORM_PROFILE
    "iso-hosted"
    CACHE STRING "Platform API contract: iso-hosted, posix-2008, or win32")
set_property(CACHE PROJECT_PLATFORM_PROFILE PROPERTY STRINGS iso-hosted posix-2008 win32)
set(PROJECT_WIN32_WINNT
    "0x0A00"
    CACHE STRING "Minimum Windows API level for the win32 profile")

set(PROJECT_SANITIZER
    "none"
    CACHE STRING "Runtime instrumentation: none or address-undefined")
set_property(CACHE PROJECT_SANITIZER PROPERTY STRINGS none address-undefined)

if(NOT PROJECT_SANITIZER STREQUAL "none" AND
   NOT PROJECT_SANITIZER STREQUAL "address-undefined")
  message(FATAL_ERROR
    "Unsupported PROJECT_SANITIZER='${PROJECT_SANITIZER}'. "
    "Choose none or address-undefined.")
endif()

if(PROJECT_PLATFORM_PROFILE STREQUAL "posix-2008")
  if(WIN32)
    message(FATAL_ERROR "The posix-2008 profile is incompatible with a Windows target")
  endif()
elseif(PROJECT_PLATFORM_PROFILE STREQUAL "win32")
  if(NOT WIN32)
    message(FATAL_ERROR "The win32 profile requires a Windows target")
  endif()
  if(NOT PROJECT_WIN32_WINNT MATCHES "^0x[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]$")
    message(FATAL_ERROR
      "PROJECT_WIN32_WINNT must be a four-digit hexadecimal API level, "
      "for example 0x0A00")
  endif()
elseif(NOT PROJECT_PLATFORM_PROFILE STREQUAL "iso-hosted")
  message(FATAL_ERROR
    "Unsupported PROJECT_PLATFORM_PROFILE='${PROJECT_PLATFORM_PROFILE}'. "
    "Choose iso-hosted, posix-2008, or win32.")
endif()

message(STATUS "C platform profile: ${PROJECT_PLATFORM_PROFILE}")
if(PROJECT_PLATFORM_PROFILE STREQUAL "win32")
  message(STATUS "Win32 minimum API level: ${PROJECT_WIN32_WINNT}")
endif()
message(STATUS "C sanitizer profile: ${PROJECT_SANITIZER}")

set(PROJECT_LIBRARY_SOURCES
    "src/library.c"
    CACHE STRING "Semicolon-separated library source list")
set(PROJECT_CLI_SOURCES
    "src/main.c"
    CACHE STRING "Semicolon-separated CLI source list")
set(PROJECT_TEST_SOURCES
    "tests/project_tests.c"
    CACHE STRING "Semicolon-separated test source list")

# Keep the analysis database limited to targets that opt in below. This avoids
# turning vendored or dependency targets into project-owned analyzer inputs.
set(CMAKE_EXPORT_COMPILE_COMMANDS OFF)

set(PROJECT_GENERATED_INCLUDE_DIR "${PROJECT_BINARY_DIR}/generated/include")

function(project_apply_common target)
  get_target_property(_type ${target} TYPE)
  set(_is_interface OFF)
  if(_type STREQUAL "INTERFACE_LIBRARY")
    set(_is_interface ON)
  endif()

  if(_is_interface)
    target_include_directories(${target} INTERFACE
      $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
      $<BUILD_INTERFACE:${PROJECT_GENERATED_INCLUDE_DIR}>
      $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
    )
    set(_feature_scope INTERFACE)
  elseif(_type STREQUAL "STATIC_LIBRARY" OR _type STREQUAL "SHARED_LIBRARY" OR
         _type STREQUAL "MODULE_LIBRARY" OR _type STREQUAL "OBJECT_LIBRARY")
    target_include_directories(${target} PUBLIC
      $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
      $<BUILD_INTERFACE:${PROJECT_GENERATED_INCLUDE_DIR}>
      $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
    )
    set(_feature_scope PUBLIC)
  else()
    target_include_directories(${target} PRIVATE "${PROJECT_SOURCE_DIR}/include")
    set(_feature_scope PRIVATE)
  endif()

  project_apply_c_standards(${target} ${_feature_scope})
  project_apply_platform_profile(${target})

  if(NOT _is_interface)
    set_property(TARGET ${target} PROPERTY EXPORT_COMPILE_COMMANDS ON)
  endif()
  set_property(TARGET ${target} PROPERTY PROJECT_C_STANDARDS_APPLIED TRUE)

  # Visibility: default to hidden for shared libs; export public symbols explicitly.
  if(_type STREQUAL "SHARED_LIBRARY")
    set_target_properties(${target} PROPERTIES
      C_VISIBILITY_PRESET hidden
    )
  endif()

  if(PROJECT_SANITIZER STREQUAL "address-undefined" AND NOT _is_interface)
    if(MINGW OR CMAKE_CROSSCOMPILING)
      message(FATAL_ERROR
        "The address-undefined profile is supported only for native Clang/GCC builds")
    endif()
    target_compile_options(${target} PRIVATE
      -fsanitize=address,undefined
      -fno-omit-frame-pointer
      -fno-sanitize-recover=all
    )
    get_target_property(_target_type ${target} TYPE)
    if(_target_type STREQUAL "EXECUTABLE" OR _target_type STREQUAL "SHARED_LIBRARY" OR
       _target_type STREQUAL "MODULE_LIBRARY")
      target_link_options(${target} PRIVATE
        -fsanitize=address,undefined
        -fno-sanitize-recover=all
      )
    endif()
  endif()

endfunction()

add_library(project_library STATIC ${PROJECT_LIBRARY_SOURCES})
project_apply_common(project_library)
set_target_properties(project_library PROPERTIES
  DEFINE_SYMBOL PROJECT_LIBRARY_EXPORTS
  OUTPUT_NAME ${PROJECT_NAME}
  EXPORT_NAME library
  VERSION ${PROJECT_VERSION}
  SOVERSION ${PROJECT_VERSION_MAJOR}
)
target_compile_definitions(project_library PUBLIC PROJECT_LIBRARY_STATIC_DEFINE)
add_library(${PROJECT_NAME}::library ALIAS project_library)

if(PROJECT_BUILD_SHARED)
  add_library(project_library_shared SHARED ${PROJECT_LIBRARY_SOURCES})
  project_apply_common(project_library_shared)
  set_target_properties(project_library_shared PROPERTIES
    DEFINE_SYMBOL PROJECT_LIBRARY_EXPORTS
    OUTPUT_NAME ${PROJECT_NAME}
    EXPORT_NAME library_shared
    VERSION ${PROJECT_VERSION}
    SOVERSION ${PROJECT_VERSION_MAJOR}
  )
  add_library(${PROJECT_NAME}::library_shared ALIAS project_library_shared)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    target_link_options(project_library_shared PRIVATE "LINKER:-z,defs")
  endif()
endif()

if(TARGET project_library_shared)
  set(PROJECT_EXPORT_HEADER_TARGET project_library_shared)
else()
  set(PROJECT_EXPORT_HEADER_TARGET project_library)
endif()
generate_export_header(${PROJECT_EXPORT_HEADER_TARGET}
  BASE_NAME PROJECT_LIBRARY
  EXPORT_FILE_NAME "${PROJECT_GENERATED_INCLUDE_DIR}/project/library_export.h"
  STATIC_DEFINE PROJECT_LIBRARY_STATIC_DEFINE
)

if(PROJECT_BUILD_CLI)
  add_executable(project_cli ${PROJECT_CLI_SOURCES})
  target_link_libraries(project_cli PRIVATE project_library)
  project_apply_common(project_cli)
endif()

if(BUILD_TESTING)
  add_executable(project_tests ${PROJECT_TEST_SOURCES})
  target_link_libraries(project_tests PRIVATE project_library)
  project_apply_common(project_tests)
  add_test(NAME project_tests COMMAND project_tests)
endif()

# Keep this after all owned add_subdirectory calls and target declarations. The
# assertion recursively checks owned subdirectories.
project_assert_c_standards_applied()

if(PROJECT_INSTALL)
  set(PROJECT_INSTALL_TARGETS project_library)
  if(TARGET project_library_shared)
    list(APPEND PROJECT_INSTALL_TARGETS project_library_shared)
  endif()

  install(TARGETS ${PROJECT_INSTALL_TARGETS}
    EXPORT ${PROJECT_NAME}Targets
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    INCLUDES DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
  )

  install(DIRECTORY include/
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
    FILES_MATCHING PATTERN "*.h"
  )
  install(DIRECTORY "${PROJECT_GENERATED_INCLUDE_DIR}/"
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
    FILES_MATCHING PATTERN "*.h"
  )

  install(EXPORT ${PROJECT_NAME}Targets
    NAMESPACE ${PROJECT_NAME}::
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}
  )

  configure_package_config_file(
    "${PROJECT_SOURCE_DIR}/cmake/project-name-config.cmake.in"
    "${PROJECT_BINARY_DIR}/${PROJECT_NAME}Config.cmake"
    INSTALL_DESTINATION "${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}"
  )
  write_basic_package_version_file(
    "${PROJECT_BINARY_DIR}/${PROJECT_NAME}ConfigVersion.cmake"
    VERSION "${PROJECT_VERSION}"
    COMPATIBILITY SameMajorVersion
  )
  install(FILES
    "${PROJECT_BINARY_DIR}/${PROJECT_NAME}Config.cmake"
    "${PROJECT_BINARY_DIR}/${PROJECT_NAME}ConfigVersion.cmake"
    DESTINATION "${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}"
  )
endif()
