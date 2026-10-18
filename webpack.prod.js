// Set this before loading common: it selects CSS extraction instead of style-loader.
process.env.NODE_ENV = 'production';

const { merge } = require('webpack-merge');

const common = require('./webpack.common');

module.exports = merge(common, {
    mode: 'production',
    entry: {
        ...common.entry,
        'serviceworker': './serviceworker.js'
    }
});
