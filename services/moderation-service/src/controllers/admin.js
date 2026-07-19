const { createHttpError } = require('@ecobazar/platform');
const env = require('../config');

const IDENTITY_URL = 'http://identity-service:4001';
const CATALOG_URL = 'http://catalog-service:4002';
const ORDER_URL = 'http://order-service:4004';

async function fetchInternal(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': env.INTERNAL_SERVICE_TOKEN,
      ...(options.headers || {})
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw createHttpError(`Internal fetch failed: ${text}`, response.status);
  }
  
  if (response.status === 204) return null;
  return response.json();
}

async function getUsers(req, res, next) {
  try {
    const data = await fetchInternal(`${IDENTITY_URL}/internal/users`);
    res.json(data);
  } catch (err) { next(err); }
}

async function suspendUser(req, res, next) {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    await fetchInternal(`${IDENTITY_URL}/internal/users/${id}/suspend`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active })
    });
    res.status(204).end();
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    await fetchInternal(`${IDENTITY_URL}/internal/users/${id}`, {
      method: 'DELETE'
    });
    res.status(204).end();
  } catch (err) { next(err); }
}

async function changeRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;
    await fetchInternal(`${IDENTITY_URL}/internal/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
    res.status(204).end();
  } catch (err) { next(err); }
}

async function getApplications(req, res, next) {
  try {
    const data = await fetchInternal(`${CATALOG_URL}/internal/seller-applications`);
    res.json(data);
  } catch (err) { next(err); }
}

async function approveApplication(req, res, next) {
  try {
    const { id } = req.params;
    
    // 1. Aprobar en catalog
    const appData = await fetchInternal(`${CATALOG_URL}/internal/seller-applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' })
    });
    
    // 2. Cambiar rol en identity automáticamente
    if (appData && appData.user_id) {
      await fetchInternal(`${IDENTITY_URL}/internal/users/${appData.user_id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'vendedor' })
      });
    }

    res.status(204).end();
  } catch (err) { next(err); }
}

async function rejectApplication(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await fetchInternal(`${CATALOG_URL}/internal/seller-applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', rejection_reason: reason })
    });
    res.status(204).end();
  } catch (err) { next(err); }
}

async function getSalesReports(req, res, next) {
  try {
    const data = await fetchInternal(`${ORDER_URL}/internal/reports/sales`);
    res.json(data);
  } catch (err) { next(err); }
}

module.exports = {
  getUsers, suspendUser, deleteUser, changeRole,
  getApplications, approveApplication, rejectApplication,
  getSalesReports
};
