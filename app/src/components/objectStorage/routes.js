/* eslint-disable no-unused-vars */
const routes = require('express').Router();
const Problem = require('api-problem');

const controller = require('./controller');
const dalController = require('../objectRecordData/controller');

/** Creates a new object */
routes.post('/', (req, res, next) => {
  controller.createObject(req, res, next);
  // TODO: how the method above, it's error handing, and it's return vals play
  // with the method below needs to be figured out, callback? wait?
  dalController.create(req, res, next);
});

/** List all user accessible objects */
routes.get('/', (req, res, next) => {
  new Problem(501).send(res);
});

/** Returns the object */
routes.get('/:objId', (req, res, next) => {
  controller.readObject(req, res, next);
});

/** Updates an object */
routes.post('/:objId', (req, res, next) => {
  controller.updateObject(req, res, next);
});

/** Deletes the object */
routes.delete('/:objId', (req, res, next) => {
  controller.deleteObject(req, res, next);
});

/** Returns the object version history */
routes.get('/:objId/versions', (req, res, next) => {
  controller.listObjectVersion(req, res, next);
});

/** Sets an object public property */
routes.patch('/:objId/public', (req, res, next) => {
  new Problem(501).send(res);
});

/** Returns the object permissions */
routes.get('/:objId/permissions', (req, res, next) => {
  new Problem(501).send(res);
});

/** Grants object permissions to a specific user */
routes.post('/:objId/permissions/:userId', (req, res, next) => {
  new Problem(501).send(res);
});

/** Deletes object permissions for a specific user */
routes.delete('/:objId/permissions/:userId', (req, res, next) => {
  new Problem(501).send(res);
});

module.exports = routes;
