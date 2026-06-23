!> Core library module for the project.
module project_name
   use, intrinsic :: iso_fortran_env, only : int64

   implicit none
   private

   public :: counter_type
   public :: triangular

   !> Monotonic integer counter with explicit state ownership.
   type :: counter_type
      private
      integer(int64) :: value = 0_int64
   contains
      procedure :: current => counter_current
      procedure :: increment => counter_increment
   end type counter_type

contains

   !> Return the nth triangular number, or zero for non-positive input.
   pure function triangular(n) result(value)
      integer(int64), intent(in) :: n
      integer(int64) :: value

      if (n <= 0_int64) then
         value = 0_int64
      else
         value = (n * (n + 1_int64)) / 2_int64
      end if
   end function triangular

   !> Return the current counter value.
   pure function counter_current(self) result(value)
      class(counter_type), intent(in) :: self
      integer(int64) :: value

      value = self%value
   end function counter_current

   !> Increment the counter by one and return the new value.
   subroutine counter_increment(self, value)
      class(counter_type), intent(inout) :: self
      integer(int64), intent(out) :: value

      self%value = self%value + 1_int64
      value = self%value
   end subroutine counter_increment

end module project_name
