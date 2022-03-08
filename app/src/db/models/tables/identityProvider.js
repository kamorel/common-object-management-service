const { Model } = require('objection');
const { Timestamps } = require('../mixins');
const stamps = require('../jsonSchema').stamps;

class IdentityProvider extends Timestamps(Model) {
  static get tableName() {
    return 'identity_provider';
  }

  static get idColumn() {
    return 'idp';
  }

  static get relationMappings() {
    const IdentityProvider = require('./identityProvider');

    return {
      identityProvider: {
        relation: Model.BelongsToOneRelation,
        modelClass: IdentityProvider,
        join: {
          from: 'user.idp',
          to: 'identity_provider.idp'
        }
      }
    };
  }

  static get modifiers() {
    return {
      filterActive(query, value) {
        if (value !== undefined) {
          query.where('active', value);
        }
      },
      orderDefault(builder) {
        builder.orderByRaw('lower("identity_provider"."idp")');
      }
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['idp'],
      properties: {
        idp: { type: 'string', minLength: 1, maxLength: 255 },
        active: { type: 'boolean' },
        ...stamps
      },
      additionalProperties: false
    };
  }

}

module.exports = IdentityProvider;
