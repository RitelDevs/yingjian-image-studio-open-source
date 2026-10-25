import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './spatial.css';
import './focus.css';
import { installFocusVisibility } from './focus-visibility.js';

const disposeFocusVisibility = installFocusVisibility();
if (import.meta.hot) import.meta.hot.dispose(disposeFocusVisibility);

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
