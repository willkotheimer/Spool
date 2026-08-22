/**
 * `better-sqlite3-multiple-ciphers` ships no types of its own — it is `better-sqlite3` plus
 * SQLCipher, so it borrows that package's types and adds nothing to the surface this app uses.
 */
declare module 'better-sqlite3-multiple-ciphers' {
  import Database from 'better-sqlite3'
  export = Database
}
