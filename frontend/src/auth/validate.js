const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAuth(mode, values) {
  const errors = {}

  if (mode === 'signup' && !values.name.trim()) {
    errors.name = 'Enter your full name.'
  }

  if (!values.email.trim()) {
    errors.email = 'Enter your email.'
  } else if (!EMAIL.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!values.password) {
    errors.password = 'Enter your password.'
  } else if (mode === 'signup' && values.password.length < 8) {
    errors.password = 'Use at least 8 characters.'
  }

  if (mode === 'signup') {
    if (!values.role) {
      errors.role = 'Choose inspector or store owner.'
    }
    if (values.role === 'owner' && !values.storeId) {
      errors.storeId = 'Choose your store.'
    }
    if (!values.confirm) {
      errors.confirm = 'Confirm your password.'
    } else if (values.confirm !== values.password) {
      errors.confirm = 'Passwords do not match.'
    }
  }

  return errors
}

export function focusFirstError(errors) {
  const id = errors.name
    ? 'name'
    : errors.email
      ? 'email'
      : errors.role
        ? 'role-inspector'
        : errors.storeId
          ? 'storeId'
          : errors.password
            ? 'password'
            : errors.confirm
              ? 'confirm'
              : null

  if (id) document.getElementById(id)?.focus()
}
