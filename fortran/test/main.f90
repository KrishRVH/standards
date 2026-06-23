program tester
   use, intrinsic :: iso_fortran_env, only : error_unit
   use test_project_name, only : collect_project_name
   use testdrive, only : get_argument, new_testsuite, run_selected, run_testsuite, select_suite, &
      testsuite_type

   implicit none

   integer :: index
   integer :: status
   character(len=:), allocatable :: suite_name
   character(len=:), allocatable :: test_name
   type(testsuite_type), allocatable :: testsuites(:)
   character(len=*), parameter :: fmt = '("#", *(1x, a))'

   status = 0
   testsuites = [new_testsuite("project_name", collect_project_name)]

   call get_argument(1, suite_name)
   call get_argument(2, test_name)

   if (allocated(suite_name)) then
      index = select_suite(testsuites, suite_name)
      if (index < 1 .or. index > size(testsuites)) then
         write(error_unit, fmt) "Available testsuites"
         do index = 1, size(testsuites)
            write(error_unit, fmt) "-", testsuites(index)%name
         end do
         error stop 1
      end if

      if (allocated(test_name)) then
         write(error_unit, fmt) "Suite:", testsuites(index)%name
         call run_selected(testsuites(index)%collect, test_name, error_unit, status)
         if (status < 0) error stop 1
      else
         write(error_unit, fmt) "Testing:", testsuites(index)%name
         call run_testsuite(testsuites(index)%collect, error_unit, status)
      end if
   else
      do index = 1, size(testsuites)
         write(error_unit, fmt) "Testing:", testsuites(index)%name
         call run_testsuite(testsuites(index)%collect, error_unit, status)
      end do
   end if

   if (status > 0) then
      write(error_unit, '(i0, 1x, a)') status, "test(s) failed!"
      error stop 1
   end if
end program tester
