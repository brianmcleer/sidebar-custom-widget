/** @jsx jsx */
import { React, jsx } from 'jimu-core'
import { defaultMessages as jimuUIDefaultMessages } from 'jimu-ui'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import SidebarLayoutSetting from './layout-setting'
import { defaultConfig } from '../config'
import defaultMessages from './translations/default'

type SettingProps = AllWidgetSettingProps<any> & {
  id: string
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
