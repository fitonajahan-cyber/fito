const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('db_lks', 'root', 'rahasia123', {
  host: 'localhost',
  dialect: 'mysql'
});

module.exports = sequelize;
