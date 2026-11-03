import { keypadPress, parseKeypadValue } from '../number-keypad'

it('supports digits, fractions, sign, correction and clear', () => {
  let text = '0'
  for (const key of ['2', '5', '.', '5']) text = keypadPress(text, key, true)
  expect(text).toBe('25.5')
  expect(keypadPress(text, '.', true)).toBe('25.5')
  expect(keypadPress(text, '±', true)).toBe('-25.5')
  expect(keypadPress(text, '⌫', true)).toBe('25.')
  expect(keypadPress(text, 'C', true)).toBe('0')
  expect(keypadPress('0', '.', false)).toBe('0')
  expect(keypadPress('-0', '3', false)).toBe('-3')
})

it('rejects invalid ranges, decimal digits for INT, and unsafe integer values in Preview', () => {
  expect(parseKeypadValue('25.5', 'REAL', 0, 100)).toBe(25.5)
  expect(parseKeypadValue('-3', 'DINT', -10, 10)).toBe(-3)
  expect(() => parseKeypadValue('25.5', 'INT', 0, 100)).toThrow('целое')
  expect(() => parseKeypadValue('105', 'REAL', 0, 100)).toThrow('Диапазон')
  expect(() => parseKeypadValue('1e12', 'REAL', 0, 1e15)).toThrow('число')
  expect(() => parseKeypadValue('2147483648', 'DINT', 0, 1e12)).toThrow('DINT')
  expect(() => parseKeypadValue('9007199254740993', 'LINT', 0, 1e18)).toThrow('слишком большое')
})
