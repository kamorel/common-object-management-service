const { NIL: SYSTEM_USER } = require('uuid');
const { Tag, VersionTag } = require('../db/models');
const { getObjectsByKeyValue } = require('../components/utils');

/**
 * The Tag DB Service
 */
const service = {

  /**
   * @function replaceTags
   * Makes the incoming list of tags the definitive set associated with versionId
   * @param {string} versionId The uuid id column from version table
   * @param {object[]} tags Incoming array of tageset objects to add for this version (eg: [{ key: 'a', value: '1'}, {key: 'B', value: '2'}])
   * @param {string} [currentUserId=SYSTEM_USER] The optional userId uuid actor; defaults to system user if unspecified
   * @param {object} [etrx=undefined] An optional Objection Transaction object
   * @returns {Promise<object>} The result of running the insert operation
   * @throws The error encountered upon db transaction failure
   */
  replaceTags: async (versionId, tags, currentUserId = SYSTEM_USER, etrx = undefined) => {
    let trx;
    try {
      trx = etrx ? etrx : await Tag.startTransaction();
      let response = [];
      if (tags && tags.length) {

        // get all currently associated tags (before update)
        const current = await Tag.query(trx)
          .joinRelated('versionTag')
          .where('versionId', versionId);

        // dissociate tags that are no longer associated
        const dissociateTags = current
          .filter(({ key, value}) => !getObjectsByKeyValue(tags, key, value));
        if (dissociateTags.length) await service.dissociateTags(versionId, dissociateTags, trx);

        // associate tags
        response = await service.associateTags(versionId, tags, currentUserId, trx);
      }

      if (!etrx) await trx.commit();
      return Promise.resolve(response);
    } catch (err) {
      if (!etrx && trx) await trx.rollback();
      throw err;
    }
  },

  /**
   * @function associateTags
   * calls createTags to create new Tag records
   * associates new tags to the versionId
   * @param {string} versionId The uuid id column from version table
   * @param {object[]} tags array of tags (eg: [{ key: 'a', value: '1'}, {key: 'B', value: '2'}])
   * @param {string} [currentUserId=SYSTEM_USER] The optional userId uuid actor; defaults to system user if unspecified
   * @param {object} [etrx=undefined] An optional Objection Transaction object
   * @returns {Promise<object>} array of all associated tags
   * @throws The error encountered upon db transaction failure
   */
  associateTags: async (versionId, tags, currentUserId = SYSTEM_USER, etrx = undefined) => {
    let trx;
    try {
      trx = etrx ? etrx : await Tag.startTransaction();
      let response = [];

      if (tags && tags.length) {
        // get id's of all input tags
        const dbTags = await service.createTags(tags, trx);

        // get all currently associated tags
        const associatedTags = await VersionTag.query(trx)
          .modify('filterVersionId', versionId);

        // TODO: exclude tags (with matching key vand value) that are already joined
        // lets us use associateTags in addTags controller

        // associate remaining tags
        const newJoins = dbTags.filter(({ id }) => {
          return !associatedTags.some(({ tagId }) => tagId === id);
        });
        if (newJoins.length) {
          await VersionTag.query(trx)
            .insert(newJoins.map(({ id }) => ({
              versionId: versionId,
              tagId: id,
              createdBy: currentUserId
            })));
        }
        response = dbTags;
      }

      if (!etrx) await trx.commit();
      return Promise.resolve(response);
    } catch (err) {
      if (!etrx && trx) await trx.rollback();
      throw err;
    }
  },

  /**
   * @function dissociateTags
   * dissociates all provided tags from a versionId
   * @param {string} versionId The uuid id column from version table
   * @param {object[]} [tags=undefined] array of tags (eg: [{ key: 'a', value: '1'}, {key: 'B', value: ''}])
   * @param {object} [etrx=undefined] An optional Objection Transaction object
   * @returns {Promise<number>} The result of running the delete operation (number of rows deleted)
   * @throws The error encountered upon db transaction failure
   */
  dissociateTags: async (versionId, tags = undefined, etrx = undefined) => {
    let trx;
    try {
      trx = etrx ? etrx : await Tag.startTransaction();
      let response = 0;

      await tags.forEach(async tag => {

        // match on key
        const params = { 'tag.key': tag.key };
        // if tag has a value match key and value
        if(tag.value && tag.value !== '') params['tag.value'] = tag.value;

        let count = 0;
        count = await VersionTag.query(trx)
          .allowGraph('tag')
          .withGraphJoined('tag')
          .where(params)
          .modify('filterVersionId', versionId)
          .delete();

        if (count) response += count;
      });

      // delete all orphaned tags
      await service.pruneOrphanedTags(trx);

      if (!etrx) await trx.commit();
      return Promise.resolve(response);
    } catch (err) {
      if (!etrx && trx) await trx.rollback();
      throw err;
    }
  },

  /**
   * @function deleteOrphanedTags
   * deletes Tag records if they are no longer related to any versions
   * @param {object} [etrx=undefined] An optional Objection Transaction object
   * @returns {Promise<number>} The result of running the delete operation (number of rows deleted)
   * @throws The error encountered upon db transaction failure
   */
  pruneOrphanedTags: async (etrx = undefined) => {
    let trx;
    try {
      trx = etrx ? etrx : await Tag.startTransaction();

      const deletedTagIds = await Tag.query(trx)
        .allowGraph('versionTag')
        .withGraphJoined('versionTag')
        .select('tag.id')
        .whereNull('versionTag.tagId');

      const response = await Tag.query(trx)
        .delete()
        .whereIn('id', deletedTagIds.map(({ id }) => id));

      if (!etrx) await trx.commit();
      return Promise.resolve(response);
    } catch (err) {
      if (!etrx && trx) await trx.rollback();
      throw err;
    }
  },

  /**
   * @function createTags
   * Inserts any tag records if they dont already exist in db
   * @param {object} tags Incoming object with `<key>:<value>` tags to add for this version
   * @param {object} [etrx=undefined] An optional Objection Transaction object
   * @returns {Promise<object>} an array of all input tags
   * @throws The error encountered upon db transaction failure
   */
  createTags: async (tags, etrx = undefined) => {
    let trx;
    let response = [];
    try {
      trx = etrx ? etrx : await Tag.startTransaction();

      // get all tags already in db
      const allTags = await Tag.query(trx).select();
      const existingTags = [];
      const newTags = [];

      tags.forEach(({ key, value }) => {
        // if tag is already in db
        if (getObjectsByKeyValue(allTags, key, value)){
          existingTags.push({ id: getObjectsByKeyValue(allTags, key, value).id, key: key, value: value });
        }
        // else add to array for inserting
        else {
          newTags.push({ key: key, value: value });
        }
      });

      // insert new tags
      if (newTags.length) {
        const newTagset = await Tag.query(trx)
          .insert(newTags)
          .returning('*');
        // merge newTags with existing tags
        response = existingTags.concat(newTagset);
      }
      else{
        response = existingTags;
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
