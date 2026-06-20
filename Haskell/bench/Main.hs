module Main (main) where

import ProjectName (double)
import Test.Tasty.Bench (bench, bgroup, defaultMain, whnf)

main :: IO ()
main =
  defaultMain
    [ bgroup
        "ProjectName"
        [bench "double" (whnf double 21)]
    ]
