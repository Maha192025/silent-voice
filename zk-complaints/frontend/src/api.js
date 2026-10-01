import axios from 'axios';
export const api = axios.create({ baseURL: '/api', withCredentials: true });
export const errMsg = (e) => e.response?.data?.message || 'Something went wrong. Please try again later.';
