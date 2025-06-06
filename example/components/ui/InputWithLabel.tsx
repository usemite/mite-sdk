import React from 'react';
import { View, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { ThemedText } from '../ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';

export type InputWithLabelProps = TextInputProps & {
  label: string;
  error?: string;
  lightColor?: string;
  darkColor?: string;
  lightBorderColor?: string;
  darkBorderColor?: string;
  containerStyle?: any;
  labelStyle?: any;
  inputStyle?: any;
  errorStyle?: any;
  required?: boolean;
};

export function InputWithLabel({
  label,
  error,
  lightColor,
  darkColor,
  lightBorderColor,
  darkBorderColor,
  containerStyle,
  labelStyle,
  inputStyle,
  errorStyle,
  required = false,
  style,
  ...textInputProps
}: InputWithLabelProps) {
  const textColor = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const borderColor = useThemeColor(
    { light: lightBorderColor, dark: darkBorderColor },
    'icon'
  );
  const placeholderColor = useThemeColor({}, 'icon');

  return (
    <View style={[styles.container, containerStyle]}>
      <ThemedText style={[styles.label, labelStyle]}>
        {label}
        {required && <ThemedText style={styles.required}>*</ThemedText>}
      </ThemedText>
      
      <TextInput
        style={[
          styles.input,
          {
            color: textColor,
            borderColor: error ? '#ef4444' : borderColor,
          },
          inputStyle,
          style,
        ]}
        placeholderTextColor={placeholderColor}
        {...textInputProps}
      />
      
      {error && (
        <ThemedText style={[styles.error, errorStyle]}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  required: {
    color: '#ef4444',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 4,
  },
});