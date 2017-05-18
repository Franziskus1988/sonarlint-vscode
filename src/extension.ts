'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as VSCode from 'vscode';
import * as Path from "path";
import * as FS from "fs";
import * as PortFinder from "portfinder";
import * as Net from "net";
import * as ChildProcess from "child_process";
import {LanguageClient, LanguageClientOptions, StreamInfo} from "vscode-languageclient";
import * as open from "open";

export function activate(context: VSCode.ExtensionContext) {
    console.log('Activating SonarLint');

     let javaExecutablePath = findJavaExecutable('java');
    
    if (javaExecutablePath == null) {
        VSCode.window.showErrorMessage("Couldn't locate java in $JAVA_HOME or $PATH");
        
        return;
    }
        
    isJava8(javaExecutablePath).then(eight => {
        if (!eight) {
            VSCode.window.showErrorMessage('SonarLint requires Java 8 (using ' + javaExecutablePath + ')');
            
            return;
        }
                    
        let clientOptions: LanguageClientOptions = {
            documentSelector: ['javascript', 'javascriptreact'],
            synchronize: {
                configurationSection: 'sonarlint'
            },
            diagnosticCollectionName: 'sonarlint',
            initializationOptions: () => {
                let configuration = VSCode.workspace.getConfiguration('sonarlint');
                return {
                    testFilePattern: configuration ? configuration.get('testFilePattern', undefined) : undefined
                };
            },
            outputChannelName: 'SonarLint',
            revealOutputChannelOn: 4 // never
        }
        
        function createServer(): Promise<StreamInfo> {
            return new Promise((resolve, reject) => {
                PortFinder.getPort({port: 55282}, (err, languageServerPort) => {
                    PortFinder.getPort({port: languageServerPort + 1}, (err2, rulePort) => {
                        let serverJar = Path.resolve(context.extensionPath, "lib", "sonarlint-server.jar");

                        let disposableCommand = VSCode.commands.registerCommand('SonarLint.OpenRuleDesc', (ruleKey) => {
                            open("http://localhost:" + rulePort + "/?ruleKey=" + encodeURIComponent(ruleKey));
                        });

                        context.subscriptions.push(disposableCommand);
                        
                        let args = [
                            '-Dsonarlint.port=' + languageServerPort,
                            '-Dsonarlint.rulePort=' + rulePort,
                            '-jar', serverJar
                        ];
                        if (startedInDebugMode()) {
                            console.log("DEBUG MODE");
                            args = ['-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=8000'].concat(args);
                        }
                        
                        console.log(javaExecutablePath + ' ' + args.join(' '));
                        
                        Net.createServer(socket => {
                            console.log('Child process connected on port ' + languageServerPort);

                            resolve({
                                reader: socket,
                                writer: socket
                            });
                        }).listen(languageServerPort, () => {
                            // Start the child java process
                            let options = { cwd: VSCode.workspace.rootPath };
                            let process = ChildProcess.spawn(javaExecutablePath, args, options);

                            process.stdout.on('data', function(data) {
                                console.log(data.toString()); 
                            });
                            process.stderr.on('data', function(data) {
                                console.log(data.toString()); 
                            });
                        });
                    });
                });
            });
        }

        context.subscriptions.push(
            new LanguageClient('vscode-sonarlint', 'SonarLint Language Server', createServer, clientOptions).start()
        );
    });
}

function startedInDebugMode() {
    let args = process.execArgv;
    if (args) {
        return args.some((arg) => /^--debug=?/.test(arg) || /^--debug-brk=?/.test(arg));
    }
    ;
    return false;
}

function isJava8(javaExecutablePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        let result = ChildProcess.execFile(javaExecutablePath, ['-version'], { }, (error, stdout, stderr) => {
            let eight = stderr.indexOf('1.8') >= 0;
            
            resolve(eight);
        });
    });
} 

function findJavaExecutable(binname: string) {
	binname = correctBinname(binname);

	// First search each JAVA_HOME bin folder
	if (process.env['JAVA_HOME']) {
		let workspaces = process.env['JAVA_HOME'].split(Path.delimiter);
		for (let i = 0; i < workspaces.length; i++) {
			let binpath = Path.join(workspaces[i], 'bin', binname);
			if (FS.existsSync(binpath)) {
				return binpath;
			}
		}
	}

	// Then search PATH parts
	if (process.env['PATH']) {
		let pathparts = process.env['PATH'].split(Path.delimiter);
		for (let i = 0; i < pathparts.length; i++) {
			let binpath = Path.join(pathparts[i], binname);
			if (FS.existsSync(binpath)) {
				return binpath;
			}
		}
	}
    
	// Else return the binary name directly (this will likely always fail downstream) 
	return null;
}

function correctBinname(binname: string) {
	if (process.platform === 'win32')
		return binname + '.exe';
	else
		return binname;
}

export function deactivate() {
}