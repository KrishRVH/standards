program project_name_cli
   use, intrinsic :: iso_fortran_env, only : int64, output_unit
   use project_name, only : triangular

   implicit none

   write(output_unit, '("triangular(10) = ", i0)') triangular(10_int64)
end program project_name_cli
