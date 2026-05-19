const path = require("path");

const sharedNodeModules = path.resolve(__dirname, "../timer-widget/node_modules");
const HtmlWebpackPlugin = require(path.join(sharedNodeModules, "html-webpack-plugin"));

module.exports = {
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    clean: true
  },
  resolve: {
    extensions: [".ts", ".js"],
    modules: [path.resolve(__dirname, "src"), sharedNodeModules, "node_modules"]
  },
  resolveLoader: {
    modules: [sharedNodeModules, "node_modules"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./public/index.html"
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, "dist")
    },
    compress: true,
    port: 3001
  }
};
