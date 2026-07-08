import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Home from './pages/Home.jsx';
import Callback from './pages/Callback.jsx';
import Debug from './pages/Debug.jsx';
import Setup from './pages/Setup.jsx';
import Room from './pages/Room.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/me" element={<Debug />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
