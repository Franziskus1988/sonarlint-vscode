'use strict';
const gulp = require('gulp');
const download = require('gulp-download');
const rename = require("gulp-rename");
const artifactoryUpload = require('gulp-artifactory-upload');
const del = require('del');
const vsce = require('vsce');
const gutil = require('gulp-util');
const fs = require('fs');
//...

gulp.task('clean', ()=>
{
    del.sync('*.vsix');
    del.sync('server');
});


gulp.task('get-server', ()=>
{
    var serverFile = 'server/sonarlint-ls.jar';
    if (fs.existsSync(serverFile)) {
        return;
    }
	return download("https://repox.sonarsource.com/sonarsource-public-builds/org/sonarsource/sonarlint/core/sonarlint-language-server/2.14.0.642/sonarlint-language-server-2.14.0.642.jar")
        .pipe(rename("sonarlint-ls.jar"))
		.pipe(gulp.dest('./server/'))
});

gulp.task('package', ['get-server'], () => {
    return vsce.createVSIX();
});

function getPackageJSON() {
    return JSON.parse(fs.readFileSync('package.json'));
}
 
gulp.task( 'deploy', ['package'], function() {
    if (process.env.TRAVIS_BRANCH != 'master') {
        gutil.log('Not on master, skip deploy');
        return;
    }
    var packageJSON = getPackageJSON();
    var name = packageJSON.name;
    var version = packageJSON.version;
    version += '.' + process.env.TRAVIS_BUILD_NUMBER;
    return gulp.src( '*.vsix' )
        .pipe( artifactoryUpload( {
                url: process.env.ARTIFACTORY_URL + '/' + process.env.ARTIFACTORY_DEPLOY_REPO + '/org/sonarsource/sonarlint/sonarlint-vsts/' + version,
                username: process.env.ARTIFACTORY_DEPLOY_USERNAME,
                password: process.env.ARTIFACTORY_DEPLOY_PASSWORD,
                rename: function( filename ) { return name + '-' + version + '.vsix'; },
                properties: {
                    'vcs.revision': process.env.TRAVIS_COMMIT,
                    'vcs.branch': process.env.TRAVIS_BRANCH,
                    'build.name': name,
                    'build.number': process.env.TRAVIS_BUILD_NUMBER
                },
                request: {
                    // options that are passed to request.put()
                }
            } ) )
        .on('error', gutil.log);
} );