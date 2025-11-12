import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.jsx'
import Home from './pages/Home.jsx'
import Placement from './pages/Placement.jsx'
import Credit from './pages/Credit.jsx'
import Params from './pages/Params.jsx'
import Sim from './pages/Sim.jsx'
import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import { ParamsProvider } from './context/ParamsProvider.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import './styles.css'
import { enableDotAsDecimal } from './utils/decimalInput';
enableDotAsDecimal();

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // PRIVÉ
      { index: true, element: <RequireAuth><Home/></RequireAuth> },
      { path: 'sim/placement', element: <RequireAuth><Placement/></RequireAuth> },
      { path: 'sim/credit', element: <RequireAuth><Credit/></RequireAuth> },
      { path: 'params', element: <RequireAuth><Params/></RequireAuth> },
      { path: 'sim', element: <RequireAuth><Sim/></RequireAuth> },

      // PUBLIC
      { path: 'login', element: <Login/> },
      { path: 'reset', element: <ResetPassword/> },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ParamsProvider>
      <RouterProvider router={router} />
    </ParamsProvider>
  </React.StrictMode>
)
