/*
 *  Copyright (c) 2015-present, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 *
 */

'use strict';
var Collection = require('./Collection');
var components = require('./components');
var collections = require('./collections');
var getParser = require('./getParser');
var matchNode = require('./matchNode');
var recast = require('recast');
var template = require('./template');

var Node = recast.types.namedTypes.Node;
var NodePath = recast.types.NodePath;

// Register all built-in collections
for (var name in collections) {
  collections[name].register();
}

/**
 * Main entry point to the tool. The function accepts multiple different kinds
 * of arguments as a convenience. In particular the function accepts either
 *
 * - a string containing source code
 *   The string is parsed with Recast
 * - a single AST node
 * - a single node path
 * - an array of nodes
 * - an array of node paths
 *
 * @exports jscodeshift
 * @param {Node|NodePath|Array|string} source
 * @param {Object} options Options to pass to Recast when passing source code
 * @return {Collection}
 */
function core(source, options) {
  return typeof source === 'string' ?
    fromSource(source, options) :
    fromAST(source);
}

/**
 * Returns a collection from a node, node path, array of nodes or array of node
 * paths.
 *
 * @ignore
 * @param {Node|NodePath|Array} source
 * @return {Collection}
 */
function fromAST(ast) {
  if (Array.isArray(ast)) {
    if (ast[0] instanceof NodePath || ast.length === 0) {
      return Collection.fromPaths(ast);
    } else if (Node.check(ast[0])) {
      return Collection.fromNodes(ast);
    }
  } else {
    if (ast instanceof NodePath) {
      return Collection.fromPaths([ast]);
    } else if (Node.check(ast)) {
      return Collection.fromNodes([ast]);
    }
  }
  throw new TypeError(
    'Received an unexpected value ' + Object.prototype.toString.call(ast)
  );
}

function fromSource(source, options) {
  if (!options) {
    options = {};
  }
  if (!options.parser) {
    options.parser = getParser();
  }
  return fromAST(recast.parse(source, options));
}

/**
 * Utility function to match a node against a pattern.
 * @augments core
 * @static
 * @param {Node|NodePath|Object} path
 * @parma {Object} filter
 * @return boolean
 */
function match(path, filter) {
  if (!(path instanceof NodePath)) {
    if (typeof path.get === 'function') {
      path = path.get();
    } else {
      path = {value: path};
    }
  }
  return matchNode(path.value, filter);
}

var plugins = [];

/**
 * Utility function for registering plugins.
 *
 * Plugins are simple functions that are passed the core jscodeshift instance.
 * They should extend jscodeshift by calling `registerMethods`, etc.
 * This method guards against repeated registrations (the plugin callback will only be called once).
 *
 * @augments core
 * @static
 * @param {Function} plugin
 */
function use(plugin) {
  if (plugins.indexOf(plugin) === -1) {
    plugins.push(plugin);
    plugin(core);
  }
}

/*
 * This is what the jsx parser uses. We have to pass in the props,
 * even though our components have no constructor, to allow for
 * custom functional components.
 * From - <Identifier name="_" />
 * To   - j.createElement(Identifier, { name: '_' }, child1, child2, ...)
 *
 * @augments core
 * @static
 * @param {}
 */
function createElement(Component, props, ...children) {
  const finalProps = Object.assign(props || {}, { children });
  const astNode = new Component(finalProps);
  astNode.__IS_JSX__ = true;
  astNode.props = finalProps;
  return astNode;
}

/**
 * Returns a version of the core jscodeshift function "bound" to a specific
 * parser.
 *
 * @augments core
 * @static
 */
function withParser(parser) {
  if (typeof parser === 'string') {
    parser = getParser(parser);
  }

  const newCore = function(source, options) {
    if (options && !options.parser) {
      options.parser = parser;
    } else {
      options = {parser};
    }
    return core(source, options);
  };

  return enrichCore(newCore, parser);
}

/**
* The ast-types library
* @external astTypes
* @see {@link https://github.com/benjamn/ast-types}
*/

function enrichCore(core, parser) {
  // add builders and types to the function for simple access
  Object.assign(core, recast.types.namedTypes);
  Object.assign(core, recast.types.builders);
  core.registerMethods = Collection.registerMethods;
  /**
  * @augments core
  * @type external:astTypes
  */
  core.types = recast.types;
  core.match = match;
  core.template = template(parser);
  core.components = components;
  core.createElement = createElement;

  // add mappings and filters to function
  core.filters = {};
  core.mappings = {};
  for (var name in collections) {
    if (collections[name].filters) {
      core.filters[name] = collections[name].filters;
    }
    if (collections[name].mappings) {
      core.mappings[name] = collections[name].mappings;
    }
  }
  core.use = use;
  core.withParser = withParser;
  return core;
}

module.exports = enrichCore(core, getParser());
