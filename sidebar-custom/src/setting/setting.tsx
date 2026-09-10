import { React } from 'jimu-core'
import { defaultMessages as jimuUIDefaultMessages } from 'jimu-ui'
import SidebarLayoutSetting from './layout-setting'
import { defaultConfig } from '../config'
import defaultMessages from './translations/default'

// Local structural type for jimu-for-builder's AllWidgetSettingProps (type-only;
// erased at build). Declared here rather than imported so Visual Studio's mode B
// shim can type it.
type SettingProps = {
  id: string
  config: any
  onSettingChange: (settings: any, ...rest: any[]) => void
  intl?: any
  theme?: any
  useDataSources?: any
  useMapWidgetIds?: any
  portalUrl?: string
  [key: string]: any
}

export default class Setting extends React.PureComponent<SettingProps> {
  declare readonly props: SettingProps
  formatMessage = (id: string) => {
    const messages = Object.assign({}, defaultMessages, jimuUIDefaultMessages)
    return this.props.intl.formatMessage({ id, defaultMessage: messages[id] })
  }

  render () {
    const { config, id, onSettingChange } = this.props

    return (
      <SidebarLayoutSetting
        widgetId={id}
        config={config || defaultConfig}
        formatMessage={this.formatMessage}
        onSettingChange={onSettingChange}
      />
    )
  }
}
