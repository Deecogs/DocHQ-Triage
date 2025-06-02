import React from 'react';
import ReactDOM from 'react-dom/client';

import { RecoilRoot } from 'recoil';

import './assets/styles/app.css';
import 'react-loading-skeleton/dist/skeleton.css';
import 'react-toastify/dist/ReactToastify.css';

import App from './app';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    // <React.StrictMode>
    <RecoilRoot>
        <App />
    </RecoilRoot>
    // </React.StrictMode>
);