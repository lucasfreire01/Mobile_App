import assert from 'node:assert/strict'
import test from 'node:test'
import { VineString } from '@vinejs/vine'

// Account validators use Lucid's unique rule. Isolate the password rules from the database.
VineString.macro('unique', function () {
  return this
})

const { loginValidator, createUserValidator, signupValidator } = await import(
  '../../app/validators/user.ts'
)

const email = 'qa.user@example.test'
const validPassword = '  sample-password  '
const incompletePasswords = [
  ['missing', {}],
  ['empty', { password: '' }],
  ['only whitespace', { password: '        ' }],
]

function hasFieldError(field) {
  return (error) => error.messages?.some((message) => message.field === field) === true
}

for (const [description, fields] of incompletePasswords) {
  test(`login rejects a password that is ${description}`, async () => {
    await assert.rejects(loginValidator.validate({ email, ...fields }), hasFieldError('password'))
  })
}

test('login preserves surrounding spaces in a password with other characters', async () => {
  const payload = { email, password: validPassword }
  assert.deepEqual(await loginValidator.validate(payload), payload)
})

for (const [flow, validator] of [
  ['administrator account creation', createUserValidator],
  ['self-signup', signupValidator],
]) {
  const account = { fullName: 'Pessoa de Teste', email }

  for (const [description, fields] of incompletePasswords) {
    test(`${flow} rejects a password that is ${description}`, async () => {
      await assert.rejects(
        validator.validate({ ...account, ...fields, passwordConfirmation: validPassword }),
        hasFieldError('password')
      )
    })

    test(`${flow} rejects a confirmation that is ${description}`, async () => {
      const confirmation = 'password' in fields ? { passwordConfirmation: fields.password } : {}
      await assert.rejects(
        validator.validate({ ...account, password: validPassword, ...confirmation }),
        hasFieldError('passwordConfirmation')
      )
    })
  }

  test(`${flow} requires confirmation to match the literal password`, async () => {
    const accountWithPassword = { ...account, password: validPassword }
    await assert.rejects(
      validator.validate({ ...accountWithPassword, passwordConfirmation: validPassword.trim() }),
      hasFieldError('passwordConfirmation')
    )

    const payload = { ...accountWithPassword, passwordConfirmation: validPassword }
    assert.deepEqual(await validator.validate(payload), payload)
  })
}
