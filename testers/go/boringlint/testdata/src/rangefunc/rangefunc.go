package rangefunc

import "iter"

type localSeq func(func(string) bool)

type firstIntSeq func(func(int) bool)

type secondIntSeq func(func(int) bool)

type seqLike[T any] interface {
	~func(func(T) bool)
}

type sliceLike[T any] interface {
	~[]T
}

type namedSeqLike interface {
	firstIntSeq | secondIntSeq
}

type seqOrSlice interface {
	~func(func(int) bool) | ~[]int
}

type onlySeq interface {
	seqOrSlice
	~func(func(int) bool)
}

type onlySlice interface {
	seqOrSlice
	~[]int
}

func yieldFunc(yield func(int) bool) {
	for index := 0; index < 3; index++ {
		if !yield(index) {
			return
		}
	}
}

func makeLocalSeq() localSeq {
	return nil
}

func makeIterSeq() iter.Seq[int] {
	return func(yield func(int) bool) {
		yield(1)
	}
}

func rangeFunctions() {
	for value := range yieldFunc { // want `range over a function value`
		_ = value
	}
	for value := range makeLocalSeq() { // want `range over a function value`
		_ = value
	}
	for value := range makeIterSeq() { // want `range over a function value`
		_ = value
	}
}

func rangeGenericFunction[S seqLike[int]](sequence S) {
	for value := range sequence { // want `range over a function value`
		_ = value
	}
}

func rangeNamedUnion[S namedSeqLike](sequence S) {
	for value := range sequence { // want `range over a function value`
		_ = value
	}
}

func rangeIntersection[S onlySeq](sequence S) {
	for value := range sequence { // want `range over a function value`
		_ = value
	}
}

func allowedRanges[S sliceLike[int]](values S) {
	for index := range 3 {
		_ = index
	}
	for _, value := range values {
		_ = value
	}
	for key := range map[string]int{"answer": 42} {
		_ = key
	}
	channel := make(chan int)
	close(channel)
	for value := range channel {
		_ = value
	}
	for _, value := range "abc" {
		_ = value
	}
}

func allowedIntersection[S onlySlice](values S) {
	for _, value := range values {
		_ = value
	}
}
