module Main (main) where

import StandardsHaskellTester (double)
import Test.Tasty.Bench (bench, bgroup, defaultMain, whnf)

main :: IO ()
main =
  defaultMain
    [ bgroup
        "StandardsHaskellTester"
        [bench "double" (whnf double 21)]
    ]
