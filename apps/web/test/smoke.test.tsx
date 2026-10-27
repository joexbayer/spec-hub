import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

test('renders', () => {
  render(<div>ok</div>)
  expect(screen.getByText('ok')).toBeTruthy()
})
