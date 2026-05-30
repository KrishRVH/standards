#include "project/library.h"

int main(void) {
  if (project_add(2, 3) != 5) {
    return 1;
  }

  return 0;
}
