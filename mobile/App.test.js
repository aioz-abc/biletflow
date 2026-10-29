import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from './App';

describe('<App />', () => {
  it('renders login screen correctly', async () => {
    await render(<App />);
    expect(screen.getByText('Event Admin Login')).toBeTruthy();
  });
});