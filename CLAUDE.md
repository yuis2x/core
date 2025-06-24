# Claude Code Configuration

This file contains project-specific information for Claude Code to provide better assistance.

## Project Overview

**URL Note Taker** is a userscript that allows users to take notes on any webpage using a modern Preact-based interface.

## Key Technologies

- **JavaScript ES6+** - Core language
- **Preact** - UI framework (loaded via CDN)
- **Tampermonkey/Greasemonkey** - Userscript environment
- **Lodash** - Utility library
- **Day.js** - Date formatting

## Project Structure

```
.
├── userscript.js           # Main userscript file
├── README.md              # Documentation (JP/EN)
├── LICENSE                # MIT License
├── CONTRIBUTING.md        # Contribution guidelines
├── .gitignore            # Git ignore rules
├── .github/              # GitHub templates
│   ├── ISSUE_TEMPLATE/   # Issue templates
│   ├── DISCUSSION_TEMPLATE/ # Discussion templates
│   ├── pull_request_template.md
│   └── dependabot.yml
└── project-meta/         # Project configuration
    └── config.ini
```

## Development Guidelines

### Code Style
- Use ES6+ features and modern JavaScript
- Follow existing code patterns and naming conventions
- Keep functions focused and modular
- Use meaningful variable and function names

### Architecture
- **Storage API**: Manages note persistence using GM_* functions
- **Components**: Preact components for UI rendering
- **Utils**: Helper functions for common operations
- **Configuration**: Centralized settings in CONFIG object

### Key Components
- `NoteApp` - Main application component
- `storage` - Data persistence layer
- `utils` - Utility functions
- `CONFIG` - Application configuration

### Testing
- Test across multiple browsers (Chrome, Firefox, Safari, Edge)
- Test with different userscript managers (Tampermonkey, Greasemonkey, Violentmonkey)
- Verify functionality on various websites
- Check for console errors and performance issues

### Deployment
- Single file deployment as userscript
- No build process required
- Direct installation via userscript managers

## Common Tasks

### Adding New Features
1. Update `CONFIG` for new settings
2. Add utility functions to `utils` if needed
3. Implement UI changes in React components
4. Update storage schema if required
5. Test across browsers and userscript managers

### Bug Fixes
1. Identify the issue location (UI, storage, utils)
2. Add console logging for debugging
3. Test fix across different environments
4. Update relevant documentation

### Performance Optimization
- Minimize DOM manipulation
- Use debouncing for frequent operations
- Optimize storage operations
- Profile memory usage

## License and Attribution

- **License**: MIT License
- **Author**: @yuis-ice
- **Repository**: https://github.com/URL-Note-Taker/core

## Dependencies

All dependencies are loaded via CDN:
- Preact 10.19.3
- Preact Hooks 10.19.3
- HTM 3.1.1
- Lodash 4.17.21
- Day.js 1.11.7

## Browser Support

- Chrome/Chromium 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Userscript Manager Support

- Tampermonkey (recommended)
- Greasemonkey
- Violentmonkey

## Security Considerations

- All data stored locally using GM_setValue/GM_getValue
- No external API calls except CDN dependencies
- Content Security Policy compliant
- No eval() or unsafe code execution

## Known Limitations

- Requires userscript manager installation
- Limited to browser environments
- Storage tied to userscript manager data
- No cross-device synchronization

## Future Enhancements

- Export/import functionality
- Search and filtering
- Tagging system
- Markdown support
- Sync capabilities