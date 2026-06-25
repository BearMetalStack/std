---
next:
    text: 'Templates'
    link: './templates'
prev: 
    text: 'Components'
    link: './index'
---


# `/components`

The `/components` directory contains all components that you wish to be permanently available on the client. By default, all components within this directory will be served as a single bundle to the client. This enables you to use the compliant names set by `@define` for any of these components without worrying about needing to import them and having them get missed in the bundle.

Since there is no discrimination or code-splitting around these, you should be mindful about what is actually being included here.
