import test from 'node:test'
import assert from 'node:assert/strict'
import { getRegistrationValidation } from '../src/services/registration-validation.js'

const validValues = {
  name: 'Persona EcoBazar',
  email: 'persona@example.com',
  password: 'Password-seguro1',
}

test('accepts registration values that meet every requirement', () => {
  const result = getRegistrationValidation(validValues)

  assert.equal(result.isValid, true)
  assert.ok(result.name.every(({ valid }) => valid))
  assert.ok(result.email.every(({ valid }) => valid))
  assert.ok(result.password.every(({ valid }) => valid))
})

test('reports name and email requirements independently', () => {
  const result = getRegistrationValidation({
    ...validValues,
    name: 'A',
    email: 'correo-invalido',
  })

  assert.equal(result.isValid, false)
  assert.equal(result.name.find(({ id }) => id === 'min-length').valid, false)
  assert.equal(result.name.find(({ id }) => id === 'max-length').valid, true)
  assert.equal(result.name.find(({ id }) => id === 'max-length').visible, false)
  assert.equal(result.email[0].valid, false)
})

test('shows the name maximum only after 50 characters are exceeded', () => {
  const valid = getRegistrationValidation({
    ...validValues,
    name: 'a'.repeat(50),
  })
  const tooLong = getRegistrationValidation({
    ...validValues,
    name: 'a'.repeat(51),
  })

  assert.equal(valid.name.find(({ id }) => id === 'max-length').valid, true)
  assert.equal(valid.name.find(({ id }) => id === 'max-length').visible, false)
  assert.equal(tooLong.name.find(({ id }) => id === 'max-length').valid, false)
  assert.equal(tooLong.name.find(({ id }) => id === 'max-length').visible, true)
  assert.equal(tooLong.isValid, false)
})

test('reports each strong-password rule and does not require a symbol', () => {
  const result = getRegistrationValidation({
    ...validValues,
    password: 'Password seguro1',
  })

  assert.equal(result.isValid, true)
  assert.ok(result.password.every(({ valid }) => valid))

  const missingNumber = getRegistrationValidation({
    ...validValues,
    password: 'Password-seguro',
  })
  assert.equal(missingNumber.password.find(({ id }) => id === 'number').valid, false)
  assert.equal(missingNumber.isValid, false)
})

test('does not accept passwords shorter than 8 or longer than 128 characters', () => {
  const short = getRegistrationValidation({ ...validValues, password: 'Pass1!' })
  const long = getRegistrationValidation({
    ...validValues,
    password: `${validValues.password.repeat(8)}a`,
  })

  assert.equal(short.password.find(({ id }) => id === 'min-length').valid, false)
  assert.equal(short.isValid, false)
  assert.equal(short.password.find(({ id }) => id === 'max-length').visible, false)
  assert.equal(long.password.find(({ id }) => id === 'max-length').valid, false)
  assert.equal(long.password.find(({ id }) => id === 'max-length').visible, true)
  assert.equal(long.isValid, false)
})
