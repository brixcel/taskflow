const path = require('path');
const fs = require('fs');

describe('Phase 46 — Design System Migration to shadcn/ui', () => {
  const uiDir = path.resolve(__dirname, '../frontend/src/components/ui');
  const utilsFile = path.resolve(__dirname, '../frontend/src/lib/utils.js');

  describe('1. Primitives & Utility Architecture', () => {
    it('provides cn utility combining clsx and tailwind-merge', () => {
      expect(fs.existsSync(utilsFile)).toBe(true);
      const content = fs.readFileSync(utilsFile, 'utf8');
      expect(content).toContain('clsx');
      expect(content).toContain('tailwind-merge');
      expect(content).toContain('export function cn');
    });

    it('provides all mandatory UI component primitives in components/ui/', () => {
      const requiredComponents = [
        'button.jsx',
        'input.jsx',
        'textarea.jsx',
        'label.jsx',
        'badge.jsx',
        'card.jsx',
        'dialog.jsx',
        'dropdown-menu.jsx',
        'tabs.jsx',
        'table.jsx',
        'toast.jsx',
        'toaster.jsx',
        'use-toast.js',
        'index.js',
      ];

      requiredComponents.forEach((file) => {
        const filePath = path.join(uiDir, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });

    it('exports all primitives cleanly from components/ui/index.js', () => {
      const indexContent = fs.readFileSync(path.join(uiDir, 'index.js'), 'utf8');
      expect(indexContent).toContain('export * from "./button"');
      expect(indexContent).toContain('export * from "./input"');
      expect(indexContent).toContain('export * from "./badge"');
      expect(indexContent).toContain('export * from "./card"');
      expect(indexContent).toContain('export * from "./dialog"');
      expect(indexContent).toContain('export * from "./tabs"');
      expect(indexContent).toContain('export * from "./table"');
    });
  });

  describe('2. Design Token & DESIGN.md Mapping', () => {
    it('binds Button variants to TaskFlow semantic CSS variables', () => {
      const buttonContent = fs.readFileSync(path.join(uiDir, 'button.jsx'), 'utf8');
      expect(buttonContent).toContain('var(--color-btn-primary-bg');
      expect(buttonContent).toContain('var(--color-btn-secondary-bg');
      expect(buttonContent).toContain('var(--color-btn-danger-bg');
      expect(buttonContent).toContain('var(--focus-outline-color');
    });

    it('binds Badge variants to TaskFlow workflow status and priority tokens', () => {
      const badgeContent = fs.readFileSync(path.join(uiDir, 'badge.jsx'), 'utf8');
      expect(badgeContent).toContain('todo');
      expect(badgeContent).toContain('progress');
      expect(badgeContent).toContain('done');
      expect(badgeContent).toContain('overdue');
      expect(badgeContent).toContain('urgent');
      expect(badgeContent).toContain('high');
      expect(badgeContent).toContain('medium');
      expect(badgeContent).toContain('low');
    });

    it('binds Card and Table surfaces to canvas variables', () => {
      const cardContent = fs.readFileSync(path.join(uiDir, 'card.jsx'), 'utf8');
      expect(cardContent).toContain('var(--color-canvas-card');
      expect(cardContent).toContain('var(--color-canvas-card-border');

      const tableContent = fs.readFileSync(path.join(uiDir, 'table.jsx'), 'utf8');
      expect(tableContent).toContain('var(--color-canvas-hairline');
      expect(tableContent).toContain('var(--color-canvas-hover');
    });

    it('binds Dialog to modal backdrop blur and container tokens', () => {
      const dialogContent = fs.readFileSync(path.join(uiDir, 'dialog.jsx'), 'utf8');
      expect(dialogContent).toContain('var(--color-modal-bg');
      expect(dialogContent).toContain('var(--color-modal-border');
      expect(dialogContent).toContain('backdrop-blur');
    });
  });

  describe('3. Accessibility & Keyboard Standards', () => {
    it('preserves focus-visible ring styles on interactive elements', () => {
      const buttonContent = fs.readFileSync(path.join(uiDir, 'button.jsx'), 'utf8');
      expect(buttonContent).toContain('focus-visible:ring-2');

      const inputContent = fs.readFileSync(path.join(uiDir, 'input.jsx'), 'utf8');
      expect(inputContent).toContain('focus-visible:ring-1');
    });

    it('uses Radix UI accessible headless wrappers for Dialog, DropdownMenu, Label, Tabs', () => {
      const dialogContent = fs.readFileSync(path.join(uiDir, 'dialog.jsx'), 'utf8');
      expect(dialogContent).toContain('@radix-ui/react-dialog');

      const dropdownContent = fs.readFileSync(path.join(uiDir, 'dropdown-menu.jsx'), 'utf8');
      expect(dropdownContent).toContain('@radix-ui/react-dropdown-menu');

      const labelContent = fs.readFileSync(path.join(uiDir, 'label.jsx'), 'utf8');
      expect(labelContent).toContain('@radix-ui/react-label');

      const tabsContent = fs.readFileSync(path.join(uiDir, 'tabs.jsx'), 'utf8');
      expect(tabsContent).toContain('@radix-ui/react-tabs');
    });
  });

  describe('4. Call Site Integrations', () => {
    it('Settings page integrates Table, Badge, and Button primitives for sessions', () => {
      const settingsContent = fs.readFileSync(
        path.resolve(__dirname, '../frontend/src/pages/Settings.jsx'),
        'utf8'
      );
      expect(settingsContent).toContain("from '../components/ui'");
      expect(settingsContent).toContain('<Table');
      expect(settingsContent).toContain('<Badge');
      expect(settingsContent).toContain('<Button');
    });

    it('Login and Register pages integrate Input, Label, and Button primitives', () => {
      const loginContent = fs.readFileSync(
        path.resolve(__dirname, '../frontend/src/pages/Login.jsx'),
        'utf8'
      );
      expect(loginContent).toContain("from '../components/ui'");
      expect(loginContent).toContain('<Input');
      expect(loginContent).toContain('<Label');
      expect(loginContent).toContain('<Button');

      const registerContent = fs.readFileSync(
        path.resolve(__dirname, '../frontend/src/pages/Register.jsx'),
        'utf8'
      );
      expect(registerContent).toContain("from '../components/ui'");
      expect(registerContent).toContain('<Input');
      expect(registerContent).toContain('<Label');
      expect(registerContent).toContain('<Button');
    });

    it('ProjectModal integrates Button, Input, Textarea, and Label primitives', () => {
      const projectModalContent = fs.readFileSync(
        path.resolve(__dirname, '../frontend/src/components/ProjectModal.jsx'),
        'utf8'
      );
      expect(projectModalContent).toContain("from './ui'");
      expect(projectModalContent).toContain('<Input');
      expect(projectModalContent).toContain('<Textarea');
      expect(projectModalContent).toContain('<Label');
      expect(projectModalContent).toContain('<Button');
    });
  });
});
