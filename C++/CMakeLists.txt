cmake_minimum_required(VERSION 3.30)
project(cpp_project VERSION 0.1.0 LANGUAGES CXX)

include(CMakePackageConfigHelpers)
include(GNUInstallDirs)
include(CTest)

set(PROJECT_CXX_STANDARD
    26
    CACHE STRING "C++ language standard to require")
option(PROJECT_ENABLE_SANITIZERS "Enable Address+UB sanitizers (GCC/Clang only)" OFF)
option(PROJECT_ENABLE_THREAD_SANITIZER "Enable ThreadSanitizer (GCC/Clang only)" OFF)
option(PROJECT_WERROR "Treat compiler warnings as errors when supported" OFF)
option(PROJECT_MINGW_STATIC "Static link MinGW executables" ON)
option(PROJECT_BUILD_CLI "Build the CLI executable" ON)
option(PROJECT_INSTALL "Install library and headers" OFF)

set(PROJECT_LIBRARY_SOURCES
    "src/library.cpp"
    CACHE STRING "Semicolon-separated library source list")
set(PROJECT_CLI_SOURCES
    "src/main.cpp"
    CACHE STRING "Semicolon-separated CLI source list")
set(PROJECT_TEST_SOURCES
    "tests/project_tests.cpp"
    CACHE STRING "Semicolon-separated test source list")

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

function(project_require_cxx_standard target scope)
  set_target_properties(${target} PROPERTIES
    CXX_EXTENSIONS OFF
  )

  if(PROJECT_CXX_STANDARD STREQUAL "26")
    target_compile_features(${target} ${scope} cxx_std_26)
  elseif(PROJECT_CXX_STANDARD STREQUAL "23")
    target_compile_features(${target} ${scope} cxx_std_23)
  elseif(PROJECT_CXX_STANDARD STREQUAL "20")
    target_compile_features(${target} ${scope} cxx_std_20)
  else()
    message(FATAL_ERROR "Unsupported PROJECT_CXX_STANDARD=${PROJECT_CXX_STANDARD}; use 20, 23, or 26.")
  endif()
endfunction()

function(project_apply_common target)
  get_target_property(_type ${target} TYPE)
  set(_is_interface OFF)
  if(_type STREQUAL "INTERFACE_LIBRARY")
    set(_is_interface ON)
  endif()

  if(_is_interface)
    target_include_directories(${target} INTERFACE
      $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
      $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
    )
    set(_opt_scope INTERFACE)
    set(_feature_scope INTERFACE)
  elseif(_type STREQUAL "STATIC_LIBRARY" OR _type STREQUAL "SHARED_LIBRARY" OR
         _type STREQUAL "MODULE_LIBRARY" OR _type STREQUAL "OBJECT_LIBRARY")
    target_include_directories(${target} PUBLIC
      $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
      $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
    )
    set(_opt_scope PRIVATE)
    set(_feature_scope PUBLIC)
  else()
    target_include_directories(${target} PRIVATE "${PROJECT_SOURCE_DIR}/include")
    set(_opt_scope PRIVATE)
    set(_feature_scope PRIVATE)
  endif()

  project_require_cxx_standard(${target} ${_feature_scope})
  if(NOT _is_interface)
    set_target_properties(${target} PROPERTIES CXX_SCAN_FOR_MODULES OFF)
  endif()

  if(MSVC)
    target_compile_options(${target} ${_opt_scope} /W4 /permissive- /EHsc /Zc:__cplusplus)
    if(PROJECT_WERROR)
      target_compile_options(${target} ${_opt_scope} /WX)
    endif()
  else()
    target_compile_options(${target} ${_opt_scope}
      "$<$<COMPILE_LANGUAGE:CXX>:-Wall;-Wextra;-Wpedantic;-Wconversion;-Wshadow;-Wold-style-cast;-Woverloaded-virtual;-Wnon-virtual-dtor;-Wformat=2>"
    )
    if(PROJECT_WERROR)
      target_compile_options(${target} ${_opt_scope} -Werror)
    endif()
  endif()

  if(_type STREQUAL "SHARED_LIBRARY" OR _type STREQUAL "MODULE_LIBRARY")
    set_target_properties(${target} PROPERTIES
      CXX_VISIBILITY_PRESET hidden
      VISIBILITY_INLINES_HIDDEN YES
    )
  endif()

  if(PROJECT_ENABLE_SANITIZERS AND NOT _is_interface)
    if(NOT MSVC AND NOT MINGW)
      target_compile_options(${target} PRIVATE
        -fsanitize=address,undefined
        -fno-omit-frame-pointer
      )
      get_target_property(_target_type ${target} TYPE)
      if(_target_type STREQUAL "EXECUTABLE" OR _target_type STREQUAL "SHARED_LIBRARY" OR
         _target_type STREQUAL "MODULE_LIBRARY")
        target_link_options(${target} PRIVATE -fsanitize=address,undefined)
      endif()
    endif()
  endif()

  if(PROJECT_ENABLE_THREAD_SANITIZER AND NOT _is_interface)
    if(NOT MSVC AND NOT MINGW)
      target_compile_options(${target} PRIVATE
        -fsanitize=thread
        -fno-omit-frame-pointer
      )
      get_target_property(_target_type ${target} TYPE)
      if(_target_type STREQUAL "EXECUTABLE" OR _target_type STREQUAL "SHARED_LIBRARY" OR
         _target_type STREQUAL "MODULE_LIBRARY")
        target_link_options(${target} PRIVATE -fsanitize=thread)
      endif()
    endif()
  endif()

  if(WIN32 AND NOT MSVC AND PROJECT_MINGW_STATIC)
    get_target_property(_target_type ${target} TYPE)
    if(_target_type STREQUAL "EXECUTABLE")
      target_link_options(${target} PRIVATE -static)
    endif()
  endif()
endfunction()

add_library(project_library STATIC ${PROJECT_LIBRARY_SOURCES})
project_apply_common(project_library)
set_target_properties(project_library PROPERTIES
  OUTPUT_NAME ${PROJECT_NAME}
  EXPORT_NAME library
  VERSION ${PROJECT_VERSION}
  SOVERSION ${PROJECT_VERSION_MAJOR}
)
add_library(${PROJECT_NAME}::library ALIAS project_library)

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

if(PROJECT_INSTALL)
  set(PROJECT_INSTALL_TARGETS project_library)

  install(TARGETS ${PROJECT_INSTALL_TARGETS}
    EXPORT ${PROJECT_NAME}Targets
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    INCLUDES DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
  )

  install(DIRECTORY include/
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
    FILES_MATCHING
      PATTERN "*.h"
      PATTERN "*.hh"
      PATTERN "*.hpp"
      PATTERN "*.hxx"
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
