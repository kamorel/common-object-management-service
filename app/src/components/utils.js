const config = require('config');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const { AuthMode, AuthType } = require('./constants');
const log = require('./log')(module.filename);

const DELIMITER = '/';

const utils = {
  /**
   * @function addDashesToUuid
   * Yields a lowercase uuid `str` that has dashes inserted, or `str` if not a string.
   * @param {string} str The input string uuid
   * @returns {string} The string `str` but with dashes inserted, or `str` if not a string.
   */
  addDashesToUuid(str) {
    if ((typeof str === 'string' || str instanceof String) && str.length === 32) {
      return `${str.slice(0, 8)}-${str.slice(8, 12)}-${str.slice(12, 16)}-${str.slice(16, 20)}-${str.slice(20)}`.toLowerCase();
    }
    else return str;
  },

  /**
   * @function delimit
   * Yields a string `s` that will always have a trailing delimiter. Returns an empty string if falsy.
   * @param {string} s The input string
   * @returns {string} The string `s` with the trailing delimiter, or an empty string.
   */
  delimit(s) {
    if (s) return s.endsWith(DELIMITER) ? s : `${s}${DELIMITER}`;
    else return '';
  },

  /**
   * @function getAppAuthMode
   * Yields the current `AuthMode` this application is operating under.
   * @returns {string} The application AuthMode
   */
  getAppAuthMode() {
    const basicAuth = config.has('basicAuth.enabled');
    const oidcAuth = config.has('keycloak.enabled');

    if (!basicAuth && !oidcAuth) return AuthMode.NOAUTH;
    else if (basicAuth && !oidcAuth) return AuthMode.BASICAUTH;
    else if (!basicAuth && oidcAuth) return AuthMode.OIDCAUTH;
    else return AuthMode.FULLAUTH; // basicAuth && oidcAuth
  },

  /**
   * @function getCurrentIdentity
   * Attempts to acquire current identity value.
   * Always takes first non-default value available. Yields `defaultValue` otherwise.
   * @param {object} currentUser The express request currentUser object
   * @param {string} [defaultValue=undefined] An optional default return value
   * @returns {string} The current user identifier if applicable, or `defaultValue`
   */
  getCurrentIdentity(currentUser, defaultValue = undefined) {
    return utils.parseIdentityKeyClaims()
      .map(claim => utils.getCurrentTokenClaim(currentUser, claim, undefined))
      .filter(value => value) // Drop falsy values from array
      .concat(defaultValue)[0]; // Add defaultValue as last element of array
  },

  /**
   * @function getCurrentSubject
   * Attempts to acquire current subject id. Yields `defaultValue` otherwise
   * @param {object} currentUser The express request currentUser object
   * @param {string} [defaultValue=undefined] An optional default return value
   * @returns {string} The current subject id if applicable, or `defaultValue`
   */
  getCurrentSubject(currentUser, defaultValue = undefined) {
    return utils.getCurrentTokenClaim(currentUser, 'sub', defaultValue);
  },

  /**
   * @function getCurrentTokenClaim
   * Attempts to acquire a specific current token claim. Yields `defaultValue` otherwise
   * @param {object} currentUser The express request currentUser object
   * @param {string} claim The requested token claim
   * @param {string} [defaultValue=undefined] An optional default return value
   * @returns {object} The requested current token claim if applicable, or `defaultValue`
   */
  getCurrentTokenClaim(currentUser, claim, defaultValue = undefined) {
    return (currentUser && currentUser.authType === AuthType.BEARER)
      ? currentUser.tokenPayload[claim]
      : defaultValue;
  },

  /**
   * @function getGitRevision
   * Gets the current git revision hash
   * @see {@link https://stackoverflow.com/a/34518749}
   * @returns {string} The git revision hash, or empty string
   */
  getGitRevision() {
    try {
      const gitDir = (() => {
        let dir = '.git', i = 0;
        while (!existsSync(join(__dirname, dir)) && i < 5) {
          dir = '../' + dir;
          i++;
        }
        return dir;
      })();

      const head = readFileSync(join(__dirname, `${gitDir}/HEAD`)).toString().trim();
      return (head.indexOf(':') === -1)
        ? head
        : readFileSync(join(__dirname, `${gitDir}/${head.substring(5)}`)).toString().trim();
    } catch (err) {
      log.warn(err.message, { function: 'getGitRevision' });
      return '';
    }
  },

  /**
   * @function getMetadata
   * Derives metadata from a request header object
   * @param {object} obj The request headers to get key/value pairs from
   * @returns {object} An object with metadata key/value pair attributes
   */
  getMetadata(obj) {
    return Object.fromEntries(Object.keys(obj)
      .filter((key) => key.toLowerCase().startsWith('x-amz-meta-'))
      .map((key) => ([key.toLowerCase().substring(11), obj[key]]))
    );
  },

  /**
   * @function getPath
   * Gets the relative path of `objId`
   * @param {string} objId The object id
   * @returns {string} The path
   */
  getPath(objId) {
    const key = utils.delimit(config.get('objectStorage.key'));
    return utils.joinPath(key, objId);
  },

  /**
   * @function isTruthy
   * Returns true if the element name in the object contains a truthy value
   * @param {object} value The object to evaluate
   * @returns {boolean} True if truthy, false if not, and undefined if undefined
   */
  isTruthy: (value) => {
    if (value === undefined) return value;

    const isStr = typeof value === 'string' || value instanceof String;
    const trueStrings = ['true', 't', 'yes', 'y', '1'];
    return value === true || value === 1 || isStr && trueStrings.includes(value.toLowerCase());
  },

  /**
   * @function joinPath
   * Joins a set of string arguments to yield a string path
   * @param  {...string} items The strings to join on
   * @returns {string} A path string with the specified delimiter
   */
  joinPath(...items) {
    if (items && items.length) {
      const parts = [];
      items.map(p => {
        if (p) {
          p.split('/').map(x => {
            if (x && x.trim().length) parts.push(x);
          });
        }
      });
      return parts.join(DELIMITER);
    }
    else return '';
  },

  /**
   * @function getKeyValue
   * Transforms array of {<key>:<value>} objects to {key: <key>, value: <value>}
   * @param {any}
   * @param {object[]} input Array of key value tuples like `<key>:<value>`
   * @returns {object[]} Array of objects like `{key: <key>, value: <value>}`
   */
  getKeyValue(input) {
    return Object.entries(input).map(([k, v]) => ({ key: k, value: v }));
  },

  /**
   * @function getObjectsByKeyValue
   * get tag/metadata objects in array that have given key and value
   * @param {object[]} array and array of objects (eg: [{ key: 'a', value: '1'}, { key: 'b', value: '1'}]
   * @param {string} key the string to match in the objects's `key` property
   * @param {string} value the string to match in the objects's `value` property
   * @returns {object[]} an array of matching objects
   */
  getObjectsByKeyValue(array, key, value){
    return array.find(obj => (obj.key === key && obj.value === value));
  },

  /**
   * @function mixedQueryToArray
   * Standardizes query params to yield an array of unique string values
   * @param {string|string[]} param The query param to process
   * @returns {string[]} A unique, non-empty array of string values, or undefined if empty
   */
  mixedQueryToArray(param) {
    // Short circuit undefined if param is falsy
    if (!param) return undefined;

    const parsed = (Array.isArray(param))
      ? param.flatMap(p => utils.parseCSV(p))
      : utils.parseCSV(param);
    const unique = [...new Set(parsed)];

    return unique.length ? unique : undefined;
  },

  /**
   * @function parseCSV
   * Converts a comma separated value string into an array of string values
   * @param {string} value The CSV string to parse
   * @returns {string[]} An array of string values, or `value` if it is not a string
   */
  parseCSV(value) {
    return (typeof value === 'string' || value instanceof String)
      ? value.split(',').map(s => s.trim())
      : value;
  },

  /**
   * @function parseIdentityKeyClaims
   * Returns an array of strings representing potential identity key claims
   * Array will always end with the last value as 'sub'
   * @returns {string[]} An array of string values, or `value` if it is not a string
   */
  parseIdentityKeyClaims() {
    const claims = [];
    if (config.has('keycloak.identityKey')) {
      claims.push(...utils.parseCSV(config.get('keycloak.identityKey')));
    }
    return claims.concat('sub');
  },

  /**
   * @function streamToBuffer
   * Reads a Readable stream, writes to and returns an array buffer
   * @see {@link https://github.com/aws/aws-sdk-js-v3/issues/1877#issuecomment-755446927}
   * @param {Readable} stream A readable stream object
   * @returns {Buffer} A buffer usually formatted as an Uint8Array
   */
  streamToBuffer(stream) { // Readable
    return new Promise((resolve, reject) => {
      const chunks = []; // Uint8Array[]
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  },

  /**
   * @function toLowerKeys
   * Converts all key names for all objects in an array to lowercase
   * @param {object[]} arr Array of tag objects (eg: [{Key: k1, Value: V1}])
   * @returns {object[]} Array of objects (eg: [{key: k1, value: V1}]) or undefined if empty
   */
  toLowerKeys(arr) {
    if (!arr) return undefined;
    return arr.map(obj => {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => {
          return [key.toLowerCase(), value];
        }),
      );
    });
  },
};

module.exports = utils;
