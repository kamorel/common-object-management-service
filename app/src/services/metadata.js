const { NIL: SYSTEM_USER } = require('uuid');
const { Metadata, VersionMetadata } = require('../db/models');
const { getObjectsByKeyValue } = require('../components/utils');

/**
 * The Metadata DB Service
 */
const service = {


  /**
   * @function associateMetadata
   * Makes the incoming list of metadata the definitive set associated with versionId
   * Dissociaate extraneous metadata and also does collision detection for null versions (non-versioned)
   * @param {string} versionId The uuid id column from version table
   * @param {object[]} metadata Incoming array of metadata objects to add for this version (eg: [{ key: 'a', value: '1'}, {key: 'B', value: '2'}]).
   * This will always be the difinitive metadata we want on the version
   * @param {string} [currentUserId=SYSTEM_USER] The optional userId uuid actor; defaults to system user if unspecified
   * @param {object} [etrx=undefined] An optional Objection Transaction object
   * @returns {Promise<object>} The result of running the insert operation
   * @throws The error encountered upon db transaction failure
   */
  associateMetadata: async (versionId, metadata, currentUserId = SYSTEM_USER, etrx = undefined) => {
    let trx;
    try {
      trx = etrx ? etrx : await Metadata.startTransaction();
      let response = [];

      if (metadata && metadata.length) {
        // get DB records of all input metadata
        const dbMetadata = await service.createMetadata(metadata, trx);

        // for non-versioned objects we are updating metadata joins for an existing version
        const associatedMetadata = await VersionMetadata.query(trx)
          .modify('filterVersionId', versionId);
        // remove existing joins for metadata that is not in incomming set
        if (associatedMetadata.length) {
          const dissociateMetadata = associatedMetadata.filter(({ metadataId }) => !dbMetadata.some(({ id }) => id === metadataId));
          if (dissociateMetadata.length) {
            await VersionMetadata.query(trx)
              .whereIn('metadataId', dissociateMetadata.map(vm => vm.metadataId))
              .modify('filterVersionId', versionId)
              .delete();

            // delete all orphaned metadata records
            await service.pruneOrphanedMetadata(trx);
          }
        }

        // join new metadata
        const newJoins = associatedMetadata.length ? dbMetadata.filter(({ id }) => !associatedMetadata.some(({ metadataId }) => metadataId === id)) : dbMetadata;

        if (newJoins.length) {
          response = await VersionMetadata.query(trx)
            .insert(newJoins.map(({ id }) => ({
              versionId: versionId,
              metadataId: id,
              createdBy: currentUserId
            })));
        }
      }

      if (!etrx) await trx.commit();
      return Promise.resolve(response);
    } catch (err) {
      if (!etrx && trx) await trx.rollback();
      throw err;
    }
  },

  /**
   * @function deleteOrphanedMetadata
   * deletes Metadata records if they are no longer related to any versions
   * @param {object} [etrx=undefined] An optional Objection Transaction object
   * @returns {Promise<number>} The result of running the delete operation (number of rows deleted)
   * @throws The error encountered upon db transaction failure
   */
  // TODO: check if deleteing a version will prune orphan metadata records (sister table)
  pruneOrphanedMetadata: async (etrx = undefined) => {
    let trx;
    try {
      trx = etrx ? etrx : await Metadata.startTransaction();

      const deletedMetadataIds = await Metadata.query(trx)
        .allowGraph('versionMetadata')
        .withGraphJoined('versionMetadata')
        .select('metadata.id')
        .whereNull('versionMetadata.metadataId');

      const response = await Metadata.query(trx)
        .delete()
        .whereIn('id', deletedMetadataIds.map(({ id }) => id));

      if (!etrx) await trx.commit();
      return Promise.resolve(response);
    } catch (err) {
      if (!etrx && trx) await trx.rollback();
      throw err;
    }
  },

  /**
   * @function createMetadata
   * Inserts any metadata records if they dont already exist in db
   * @param {object} metadata Incoming object with `<key>:<value>` metadata to add for this version
   * @param {object} [etrx=undefined] An optional Objection Transaction object
   * @returns {Promise<object>} an array of all input metadata
   * @throws The error encountered upon db transaction failure
   */
  createMetadata: async (metadata, etrx = undefined) => {
    let trx;
    let response = [];
    try {
      trx = etrx ? etrx : await Metadata.startTransaction();

      // get all metadata already in db
      const allMetadata = await Metadata.query(trx).select();
      const existingMetadata = [];
      const newMetadata = [];

      metadata.forEach(({ key, value }) => {
        // if metadata is already in db
        if (getObjectsByKeyValue(allMetadata, key, value)) {
          // add metadata object to existingMetadata array
          existingMetadata.push({ id: getObjectsByKeyValue(allMetadata, key, value).id, key: key, value: value });
        }
        // else add to array for inserting
        else {
          newMetadata.push({ key: key, value: value });
        }
      });
      // insert new metadata
      if (newMetadata.length) {
        const newMetadataRecords = await Metadata.query(trx)
          .insert(newMetadata)
          .returning('*');
        // merge new with existing metadata
        response = existingMetadata.concat(newMetadataRecords);
      }
      else {
        response = existingMetadata;
      }

      if (!etrx) await trx.commit();
      return Promise.resolve(response);
    } catch (err) {
      if (!etrx && trx) await trx.rollback();
      throw err;
    }
  },

};

module.exports = service;
