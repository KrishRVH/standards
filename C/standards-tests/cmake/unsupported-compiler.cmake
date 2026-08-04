set(CMAKE_C_COMPILER_ID "UnknownVendor")
set(CMAKE_C_COMPILER_FRONTEND_VARIANT "")
set(PROJECT_ALLOW_UNVERIFIED_COMPILER OFF)

include("${CMAKE_CURRENT_LIST_DIR}/../../cmake/ProjectCStandards.cmake")
project_classify_c_compiler(compiler_family)

message(FATAL_ERROR "UnknownVendor unexpectedly classified as ${compiler_family}")
