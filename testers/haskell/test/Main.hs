module Main (main) where

import StandardsHaskellTester (double)
import Test.Tasty (TestTree, defaultMain, testGroup)
import Test.Tasty.HUnit (testCase, (@?=))
import Test.Tasty.QuickCheck (NonNegative (NonNegative), testProperty)

main :: IO ()
main = defaultMain tests

tests :: TestTree
tests =
  testGroup
    "StandardsHaskellTester"
    [ testCase "doubles concrete values" (double 21 @?= 42),
      testProperty "doubles non-negative values" $
        \(NonNegative value) -> double value == value + value
    ]
