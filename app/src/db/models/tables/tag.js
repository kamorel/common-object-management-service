const { Model } = require('objection');

class Tag extends Model {
  static get tableName() {
    return 'tag';
  }

  static get relationMappings() {
    const Version = require('./version');
    const VersionTag = require('./versionTag');

    return {
      versionTag: {
        relation: Model.HasManyRelation,
        modelClass: VersionTag,
        join: {
          from: 'tag.id',
          to: 'version_tag.tagId'
        }
      },

      version: {
        relation: Model.ManyToManyRelation,
        modelClass: Version,
        join: {
          from: 'tag.id',
          through: {
            from: 'version_tag.tagId',
            to: 'version_tag.versionId'
          },
          to: 'version.id'
        }
      }
    };
  }

  static get modifiers() {
    return {
      filterKey(query, value) {
        const subqueries = [];

        if (value.tag && Object.keys(value.tag).length) {
          Object.entries(value.tag).forEach(([key]) => {
            const q = Tag.query().distinct('key').where('key', 'ilike', `%${key}%`);
            subqueries.push(q);
          });
        }

        if (subqueries.length) {
          query
            .whereIn('key', builder => {
              builder.intersect(subqueries);
            });
        }
      },
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['key', 'value'],
      properties: {
        id: { type: 'integer' },
        key: { type: 'string', minLength: 1, maxLength: 255 },
        value: { type: 'string', minLength: 1, maxLength: 255 }
      },
      additionalProperties: false
    };
  }
}

module.exports = Tag;
