var fs = require("fs");
var path = require("path");
var shelljs = require("shelljs");

var glob = require("glob");
var minimatch = require("minimatch");

shelljs.rm("-rf", "bin/dist/apiref");
shelljs.mkdir("-p", "bin/dist/apiref");

shelljs.rm("-rf", "bin/dist/apiref-dts");
shelljs.mkdir("-p", "bin/dist/apiref-dts");

function task(name, cb) {
    console.log("Start " + name);
    cb();
    console.log("Done " + name);
}

function check(cb) {
    return function(error, result) {
        if (error) {
            throw error;
        } else {
            cb(result);
        }
    }
}

function cp(file) {
    var source = path.resolve(file);
    var destination = path.resolve("bin/dist/apiref-dts", file);
    console.log(" cp " + path.relative(process.cwd(), source) + " -> " + path.relative(process.cwd(), destination));
    shelljs.mkdir("-p", path.dirname(destination));
    shelljs.cp(source, destination);
}

var nodeModules = minimatch.filter("!tns-core-modules/node_modules/**");

var moduleNames = {};
task("finding module names and coping package.json files", function() {
    glob.sync("tns-core-modules/**/package.json")
        .filter(nodeModules)
        .forEach(function(file) {
            var packageJson = JSON.parse(fs.readFileSync(file));
            if (packageJson.name && packageJson.types) {
                var moduleName = path.relative("tns-core-modules", path.dirname(file));
                var dts = path.resolve(path.dirname(file), packageJson.types);
                var base = path.relative(process.cwd(), dts);
                console.log(" + " + file + " " + base + " -> \"" + moduleName + "\"");
                moduleNames[dts] = moduleName;
            } else {
                console.log(" - " + file + " ✘");
            }
            cp(file);
        });
});

task("copying tsconfig.typedoc.json", function() {
    cp("tsconfig.typedoc.json");
});

var nonModules = {
    "tns-core-modules/tns-core-modules.d.ts": true,
    "tns-core-modules/docs-shims.d.ts": true,
    "tns-core-modules/module.d.ts": true
}

var modulePathsRegex = /from\s*"([./]*[^"]*)"\s*/g;
task("copying .d.ts files", function() {
    glob.sync("tns-core-modules/**/*.d.ts")
        .filter(nodeModules)
        .forEach(function (file) {
            var source = path.resolve(file);
            var moduleName = moduleNames[source];
            var aliased = true;
            if (!moduleName) {
                moduleName = path.relative("tns-core-modules", file);
                moduleName = moduleName.substr(0, moduleName.length - 5 /* removes .d.ts */);
                var aliased = false;
            }
            var content = fs.readFileSync(source, "utf8").replace(/^\uFEFF/, '');
            if (moduleName) {
                if (nonModules[file]) {
                    console.log("globals file: " + file);
                } else {
                    let insertionIndex = content.indexOf("\n */\n/**");
                    insertionIndex = insertionIndex >= 0 ? insertionIndex + 5 : 0;
                    content = content.substr(0, insertionIndex) +
                            "declare module \"" + moduleName + "\" {\n" + 
                            content.substr(insertionIndex) + "\n" +
                            "}";
                    // content =   + content + "\n}";
                }
                content = content.replace(modulePathsRegex, function(match, requirePath) {
                    return "from \"" + path.relative("tns-core-modules", path.resolve(path.dirname(file), requirePath)) + "\"";
                });
            }
            var destination = path.resolve("bin/dist/apiref-dts", file);
            fs.writeFileSync(destination, content);
            console.log(" cp " + path.relative(process.cwd(), source) + " -> " + path.relative(process.cwd(), destination) + " (" + moduleName + " " + (aliased ? "filename" : "package.json") + ")");
        });
});

task("run typedoc", function() {
    shelljs.exec("./node_modules/.bin/typedoc --mode file --tsconfig bin/dist/apiref-dts/tsconfig.typedoc.json --out bin/dist/apiref --includeDeclarations --name NativeScript --theme ./node_modules/nativescript-typedoc-theme");
});
