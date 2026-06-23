module test_project_name
   use, intrinsic :: iso_fortran_env, only : int64
   use project_name, only : counter_type, triangular
   use testdrive, only : check, error_type, new_unittest, unittest_type

   implicit none
   private

   public :: collect_project_name

contains

   subroutine collect_project_name(testsuite)
      type(unittest_type), allocatable, intent(out) :: testsuite(:)

      testsuite = [new_unittest("triangular", test_triangular), &
         new_unittest("counter", test_counter)]
   end subroutine collect_project_name

   subroutine test_triangular(error)
      type(error_type), allocatable, intent(out) :: error

      call check(error, triangular(-1_int64), 0_int64)
      if (allocated(error)) return

      call check(error, triangular(0_int64), 0_int64)
      if (allocated(error)) return

      call check(error, triangular(10_int64), 55_int64)
   end subroutine test_triangular

   subroutine test_counter(error)
      type(error_type), allocatable, intent(out) :: error
      type(counter_type) :: counter
      integer(int64) :: value

      call check(error, counter%current(), 0_int64)
      if (allocated(error)) return

      call counter%increment(value)
      call check(error, value, 1_int64)
      if (allocated(error)) return

      call check(error, counter%current(), 1_int64)
   end subroutine test_counter

end module test_project_name
