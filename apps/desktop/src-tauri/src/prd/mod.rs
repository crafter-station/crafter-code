//! PRD (Product Requirements Document) execution module
//!
//! Implements Ralph Wiggum-style iterative story execution:
//! - Stories with acceptance criteria
//! - Iteration loops until criteria pass
//! - Context-fresh workers (no pollution)
//! - Progress persistence via files + git

pub mod commands;
pub mod manager;
pub mod parser;
pub mod types;
pub mod verifier;

pub use manager::PrdManager;
