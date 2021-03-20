/* eslint-disable
    camelcase,
    handle-callback-err,
    no-return-assign,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let CommandRunner
const { spawn } = require('child_process')
const _ = require('lodash')
const logger = require('logger-sharelatex')

logger.info('using standard command runner')

module.exports = CommandRunner = {
  run(
    project_id,
    command,
    directory,
    image,
    timeout,
    environment,
    compileGroup,
    callback
  ) {
    let key, value
    if (callback == null) {
      callback = function (error) {}
    } else {
      callback = _.once(callback)
    }
    command = Array.from(command).map((arg) =>
      arg.toString().replace('$COMPILE_DIR', directory)
    )
    logger.log({ project_id, command, directory }, 'running command')
    logger.warn('sandboxing is not enabled with CommandRunner')

    // merge environment settings
    const env = {}
    for (key in process.env) {
      value = process.env[key]
      env[key] = value
    }
    for (key in environment) {
      value = environment[key]
      env[key] = value
    }
    for (key in env) {
      value = env[key]
      env[key] = value.toString().replace('$COMPILE_DIR', directory)
    }

    // run command as detached process so it has its own process group (which can be killed if needed)
    const proc = spawn(command[0], command.slice(1), { detached: true, cwd: directory, env })

    let stdout = '', stderr = ''
    proc.stdout.setEncoding('utf8').on('data', (data) => (stdout += data))
    proc.stderr.setEncoding('utf8').on('data', (data) => (stderr += data))

    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      logger.log({ project_id, pid: proc.pid }, 'timeout reached, killing process')
      CommandRunner.kill(proc.pid, (err) => {
        if (err)
          logger.warn({ err, project_id, pid: proc.pid }, 'failed to kill process')
      })
    }, timeout)

    proc.on('error', function (err) {
      clearTimeout(timeoutId)
      logger.err(
        { err, project_id, command, directory },
        'error running command'
      )
      return callback(err)
    })

    proc.on('close', function (code, signal) {
      let err = null
      logger.info({ code, signal, project_id }, 'command exited')
      clearTimeout(timeoutId)
      if (timedOut) {
        err = new Error('timed out')
        err.timedout = true
      } else if (signal === 'SIGTERM') {
        // signal from kill method below
        err = new Error('terminated')
        err.terminated = true
      } else if (code === 1) {
        // exit status from chktex
        err = new Error('exited')
        err.code = code
      }
      callback(err, { stdout: stdout, stderr: stderr })
    })

    return proc.pid
  }, // return process id to allow job to be killed if necessary

  kill(pid, callback) {
    if (callback == null) {
      callback = function (error) {}
    }
    try {
      process.kill(-pid) // kill all processes in group
    } catch (err) {
      return callback(err)
    }
    return callback()
  }
}
