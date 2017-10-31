/* globals require */

module.exports = (() => {

    'use strict';

    let logger = require("./utils/log.js");
    let utils = require("./utils/utils.js");
    let ruleUtils = require("./utils/rule-utils.js");

    const COMMENT_SEPARATOR = '!';
    const HINT_SEPARATOR = '!+';

    /**
     * Sorts element hiding rules:
     *  sorting by CSS selector in descending order;
     *  merging the rules with the same CSS selector;
     *  removing duplicated domains;
     *
     * @param lines
     */
    let sortElementHidingRules = function (lines) {
        let map = new Map();
        for (let line of lines) {
            let selector = ruleUtils.parseCssSelector(line);
            let selectorDomains = line.substring(0, line.indexOf('#')).split(',');
            let domains = map.get(selector) || [];

            map.set(selector, domains.concat(selectorDomains));
        }

        let sortedSelectors = Array.from(map.keys());
        sortedSelectors.sort();

        let result = [];
        for (let selector of sortedSelectors) {
            let rule = utils.removeDuplicates(map.get(selector)).join(',') + '##' + selector;
            result.push(rule);
        }

        return result;
    };

    /**
     * Checks if line is an immutable rule
     * types of rules that must be ignored(allow sorting as string, but don't change them):
     *  JS(#%#), CSS(#$#), content replacing rules($replace), protobuf($protobuf=), Content Security Policy ($csp),
     *  application modifier for Android and Windows('$app=')
     *
     * @param line
     */
    let isImmutableRule = function (line) {
        return line.includes('#%#') ||
            line.includes('#$#') ||
            line.includes('$replace') ||
            line.includes('$protobuf=') ||
            line.includes('$csp=') ||
            line.includes('$app=');
    };

    /**
     * Sorts url blocking rules:
     *  sorting the rules in descending order;
     *  //sorting of the rule modifiers(domain=, app=, protobuf=, 'replace=' must be at the and of modifiers list)
     *  sorting and merging domains list if the rules contain only $domain= modifier
     *  removing duplicates;
     *
     * @param lines
     */
    let sortUrlBlockingRules = function (lines) {

        let rest = [];
        let map = new Map();

        lines.forEach((line) => {
            let modifiers = ruleUtils.parseUrlRuleModifiers(line);
            let names = Object.getOwnPropertyNames(modifiers);
            if (names.length === 1 && modifiers.domain) {
                let url = line.substring(0, line.indexOf('$'));

                let domains = map.get(url) || [];
                map.set(url, domains.concat(modifiers.domain));
            } else {
                rest.push(line);
            }
        });

        let result = [];
        for (let url of map.keys()) {
            let domains = utils.removeDuplicates(map.get(url));
            domains.sort();

            result.push(url + '$domain=' + domains.join('|'));
        }

        result = result.concat(rest);
        result.sort();

        return result;
    };

    /**
     * Sort a block of rules
     *
     * @param list
     */
    let sortBlock = function (list) {
        logger.log(`Sorting a block of ${list.length} rules..`);

        let elementHidingRules = [];
        let urlBlockingRules = [];
        let comments = [];
        let immutables = [];

        for (let line of list) {
            if (!line) {
                continue;
            }

            //TODO: handle content-rules

            if (line.startsWith('!')) {
                comments.push(line);
            } else if (ruleUtils.isElementHidingRule(line)) {
                elementHidingRules.push(line);
            } else if (isImmutableRule(line)) {
                immutables.push(line);
            } else {
                urlBlockingRules.push(line);
            }
        }

        immutables.sort();

        let result = comments;
        result = result.concat(sortElementHidingRules(elementHidingRules));
        result = result.concat(sortUrlBlockingRules(urlBlockingRules));
        result = result.concat(immutables);

        return utils.removeDuplicates(result);
    };

    /**
     * Sort
     *
     * sorting of element hiding rules in descending order;
     *  sorting by CSS selector in descending order;
     *  merging the rules with the same CSS selector;
     *  removing duplicated domains;

     * sorting of URL rules
     *  sorting the rules in descending order;
     *  sorting of the rule modifiers(domain=, app=, protobuf=, 'replace=' must be at the and of modifiers list)
     *  sorting and merging domains list if the rules contain only $domain= modifier
     *  removing duplicates;
     * types of rules that must be ignored(allow sorting as string, but don't change them):
     *  JS(#%#), CSS(#$#), content replacing rules($replace), protobuf($protobuf=), Content Security Policy ($csp), application modifier for Android and Windows('$app=')
     *
     * @param list
     * @returns {*}
     */
    let sort = function (list) {

        logger.log(`Sorting ${list.length} rules`);

        // Split to blocks with '! ' and '!+'
        let blocks = [];
        let block = [];
        blocks.push(block);

        let hint = false;
        for (let line of list) {
            if (line.startsWith(COMMENT_SEPARATOR) || line.startsWith(HINT_SEPARATOR)) {
                block = [];
                blocks.push(block);
            }

            block.push(line);

            //In case of hint the block is only the next rule
            if (hint) {
                hint = false;

                block = [];
                blocks.push(block);
            }

            if (line.startsWith(HINT_SEPARATOR)) {
                hint = true;
            }
        }

        let result = [];
        blocks.forEach((b) => {
            result = result.concat(sortBlock(b));
        });

        logger.log(`Sorting ${list.length} rules finished, result contains ${result.length} rules.`);

        return result;
    };

    return {
        sort: sort
    };
})();