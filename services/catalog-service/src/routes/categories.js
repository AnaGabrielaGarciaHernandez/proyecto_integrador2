const express = require('express');

function createCategoriesRouter(db) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, name, slug
         FROM categories
         WHERE is_active IS TRUE
         ORDER BY name`,
      );
      res.json({ categories: result.rows });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createCategoriesRouter };
