import React, { useState, useEffect } from 'react';
import BitPlayLoader from '../components/BitPlayLoader';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ImageBackground,
  TextInput,
  Alert,
  ActivityIndicator,
  useColorScheme,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../components/types';
import { Picker } from '@react-native-picker/picker';
import { apiRequest, API_ENDPOINTS, get_data_uri, getMobileSecurityHeaders, API_BASE_URL, SERVER_BASE_URL } from '../config/api';
import { getSession } from '../auth/auth';
import { useAuth } from '../auth/AuthProvider';
import { launchImageLibrary } from 'react-native-image-picker';
import { trackProfileUpdate } from '../services/apptroveAnalytics';

type NavigationProp = StackNavigationProp<RootStackParamList, 'MyProfileEditScreen'>;

// Profile image endpoint lives on /api (direct, not via /mobile_api proxy)
const PROFILE_IMAGE_UPLOAD_URL = `${SERVER_BASE_URL}/api/profile-image/upload`;

const MyProfileEditScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user, updateUser } = useAuth();
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    gender: '',
    phoneNumber: '',
    country: '',
    city: '',
  });

  const [originalData, setOriginalData] = useState({ ...formData });

  const genderOptions = ['Male', 'Female', 'Other', 'Prefer not to say'];
  const countryOptions = [
    'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
    'France', 'India', 'China', 'Japan', 'Brazil', 'UAE', 'Other',
  ];

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      setIsLoading(true);
      const token = await getSession();
      if (!token) {
        Alert.alert('Error', 'Please login to view your profile');
        navigation.goBack();
        return;
      }
      const response = await apiRequest(API_ENDPOINTS.ME, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.success && response.user) {
        const userData = {
          name: response.user.name || '',
          gender: response.user.gender || '',
          phoneNumber: response.user.phoneNumber || '',
          country: response.user.country || '',
          city: response.user.city || '',
        };
        setFormData(userData);
        setOriginalData(userData);
        if (response.user.profileImage) {
          const serverBase = API_BASE_URL.replace('/mobile_api', '');
          setProfileImageUri(`${serverBase}${response.user.profileImage}`);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load profile data');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickImage = async () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, maxWidth: 800, maxHeight: 800 },
      async (response) => {
        if (response.didCancel || response.errorCode) return;
        const asset = response.assets?.[0];
        if (!asset?.uri) return;

        setProfileImageUri(asset.uri);
        await uploadProfileImage(asset);
      }
    );
  };

  const uploadProfileImage = async (asset: { uri?: string; type?: string; fileName?: string }) => {
    if (!user?.id || !asset.uri) return;
    try {
      setIsUploadingImage(true);
      const formData = new FormData();
      formData.append('userId', user.id);
      formData.append('profileImage', {
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: asset.fileName || 'profile.jpg',
      } as any);

      const res = await fetch(PROFILE_IMAGE_UPLOAD_URL, {
        method: 'POST',
        headers: getMobileSecurityHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        const serverBase = API_BASE_URL.replace('/mobile_api', '');
        const fullUrl = `${serverBase}${data.profileImage}`;
        setProfileImageUri(fullUrl);
        await updateUser({ ...user, profileImage: data.profileImage });
        Alert.alert('Success', 'Profile picture updated!');
      } else {
        Alert.alert('Error', data.message || 'Upload failed');
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to upload profile picture');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    const changed = Object.keys(newData).some(
      key => newData[key as keyof typeof newData] !== originalData[key as keyof typeof originalData]
    );
    setHasChanges(changed);
  };

  const handleSubmit = async () => {
    try {
      setIsSaving(true);
      const token = await getSession();
      if (!token) { Alert.alert('Error', 'Please login'); return; }

      const payload: Record<string, string> = {
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        city: formData.city,
      };
      if (formData.gender && genderOptions.includes(formData.gender)) payload.gender = formData.gender;
      if (formData.country && countryOptions.includes(formData.country)) payload.country = formData.country;

      const response = await apiRequest(API_ENDPOINTS.UPDATE_PROFILE, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (response.success) {
        Alert.alert('Success', 'Profile updated successfully');
        setOriginalData({ ...formData });
        setIsEditing(false);
        setHasChanges(false);
        trackProfileUpdate(String(user?.id ?? ''), Object.keys(payload).join(','));
        if (response.user) await updateUser(response.user);
      } else {
        Alert.alert('Error', response.message || 'Failed to update profile');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const styles = getStyles(isDarkMode);

  if (isLoading) {
    return (
      <ImageBackground source={require('../assets/images/bg_pattern.png')} style={styles.container} resizeMode="cover">
        <View style={styles.overlay} />
        <View style={styles.loadingContainer}>
          <BitPlayLoader size="lg" label="Loading profile..." />
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={require('../assets/images/bg_pattern.png')} style={styles.container} resizeMode="cover">
      <View style={styles.overlay} />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={isDarkMode ? '#fff' : '#1F2937'} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>My Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.profileCard}>
            {/* Profile Picture */}
            <TouchableOpacity style={styles.profileImageContainer} onPress={handlePickImage} activeOpacity={0.8}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileIconCircle}>
                  <Icon name="account" size={60} color="#22D3EE" />
                </View>
              )}
              <View style={styles.cameraOverlay}>
                {isUploadingImage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name="camera" size={18} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.changePhotoText}>Tap to change photo</Text>

            {/* Form Fields */}
            <View style={styles.formSection}>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={[styles.inputWrapper, styles.inputDisabled]}>
                  <Icon name="email-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput style={styles.input} value={user?.email || ''} editable={false} placeholderTextColor="#6B7280" />
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Name</Text>
                <View style={[styles.inputWrapper, !isEditing && styles.inputDisabled]}>
                  <Icon name="account-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={formData.name}
                    onChangeText={(v) => handleFieldChange('name', v)}
                    editable={isEditing}
                    placeholder="Enter your name"
                    placeholderTextColor="#6B7280"
                  />
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={[styles.inputWrapper, !isEditing && styles.inputDisabled]}>
                  <Icon name="gender-male-female" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  {isEditing ? (
                    <Picker
                      selectedValue={formData.gender}
                      onValueChange={(v) => handleFieldChange('gender', v)}
                      style={styles.picker}
                      dropdownIconColor="#22D3EE"
                    >
                      {genderOptions.map((o) => (
                        <Picker.Item key={o} label={o} value={o} color={isDarkMode ? '#fff' : '#1F2937'} />
                      ))}
                    </Picker>
                  ) : (
                    <Text style={styles.input}>{formData.gender}</Text>
                  )}
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Phone Number</Text>
                <View style={[styles.inputWrapper, !isEditing && styles.inputDisabled]}>
                  <Icon name="phone-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={formData.phoneNumber}
                    onChangeText={(v) => handleFieldChange('phoneNumber', v)}
                    editable={isEditing}
                    placeholder="Enter your phone number"
                    placeholderTextColor="#6B7280"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Country</Text>
                <View style={[styles.inputWrapper, !isEditing && styles.inputDisabled]}>
                  <Icon name="earth" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  {isEditing ? (
                    <Picker
                      selectedValue={formData.country}
                      onValueChange={(v) => handleFieldChange('country', v)}
                      style={styles.picker}
                      dropdownIconColor="#22D3EE"
                    >
                      {countryOptions.map((o) => (
                        <Picker.Item key={o} label={o} value={o} color={isDarkMode ? '#fff' : '#1F2937'} />
                      ))}
                    </Picker>
                  ) : (
                    <Text style={styles.input}>{formData.country}</Text>
                  )}
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>City</Text>
                <View style={[styles.inputWrapper, !isEditing && styles.inputDisabled]}>
                  <Icon name="city" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={formData.city}
                    onChangeText={(v) => handleFieldChange('city', v)}
                    editable={isEditing}
                    placeholder="Enter your city"
                    placeholderTextColor="#6B7280"
                  />
                </View>
              </View>
            </View>

            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={[styles.editButton, isEditing && styles.editButtonDisabled]}
                onPress={() => setIsEditing(true)}
                disabled={isEditing}
                activeOpacity={0.8}
              >
                <Icon name="pencil" size={20} color={isEditing ? '#6B7280' : '#22D3EE'} />
                <Text style={[styles.editButtonText, isEditing && styles.editButtonTextDisabled]}>Edit Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitButton, (!hasChanges || !isEditing || isSaving) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!hasChanges || !isEditing || isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name="check-circle" size={20} color={hasChanges && isEditing ? '#fff' : '#6B7280'} />
                )}
                <Text style={[styles.submitButtonText, (!hasChanges || !isEditing || isSaving) && styles.submitButtonTextDisabled]}>
                  {isSaving ? 'Saving...' : 'Submit Changes'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.bottomSpacing} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 0 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: isDarkMode ? 'rgba(10, 22, 40, 0.85)' : 'rgba(255,255,255,0.90)' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
    marginTop: Platform.OS === 'ios' ? 0 : 35, zIndex: 1,
  },
  topBarTitle: { color: isDarkMode ? '#fff' : '#1F2937', fontSize: 18, fontWeight: '600' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, zIndex: 1 },
  profileCard: {
    backgroundColor: isDarkMode ? '#1a2942' : '#ffffff',
    borderRadius: 16, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDarkMode ? 0.3 : 0.1, shadowRadius: 8, elevation: 4,
  },
  profileImageContainer: { alignItems: 'center', marginBottom: 8, position: 'relative', alignSelf: 'center' },
  profileImage: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: '#22D3EE' },
  profileIconCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: isDarkMode ? '#0A1628' : '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#22D3EE',
  },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#22D3EE',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: isDarkMode ? '#1a2942' : '#fff',
  },
  changePhotoText: { color: '#22D3EE', fontSize: 12, textAlign: 'center', marginBottom: 20 },
  formSection: { marginBottom: 24 },
  fieldContainer: { marginBottom: 16 },
  fieldLabel: { color: isDarkMode ? '#E5E7EB' : '#374151', fontSize: 14, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: isDarkMode ? '#0A1628' : '#F9FAFB',
    borderRadius: 12, borderWidth: 1, borderColor: isDarkMode ? '#374151' : '#D1D5DB',
    paddingHorizontal: 14, minHeight: 52,
  },
  inputDisabled: { backgroundColor: isDarkMode ? '#1E293B' : '#E5E7EB', opacity: 0.8 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: isDarkMode ? '#fff' : '#1F2937', fontSize: 15, paddingVertical: 14 },
  picker: { flex: 1, color: isDarkMode ? '#fff' : '#1F2937', backgroundColor: 'transparent' },
  actionButtonsContainer: { gap: 12 },
  editButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: isDarkMode ? '#0A1628' : '#F3F4F6',
    borderRadius: 12, paddingVertical: 14, borderWidth: 2, borderColor: '#22D3EE', gap: 8,
  },
  editButtonDisabled: { backgroundColor: isDarkMode ? '#1E293B' : '#E5E7EB', borderColor: isDarkMode ? '#374151' : '#9CA3AF', opacity: 0.5 },
  editButtonText: { color: '#22D3EE', fontSize: 16, fontWeight: '600' },
  editButtonTextDisabled: { color: '#6B7280' },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#22D3EE', borderRadius: 12, paddingVertical: 14, gap: 8,
  },
  submitButtonDisabled: { backgroundColor: isDarkMode ? '#374151' : '#9CA3AF', opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitButtonTextDisabled: { color: isDarkMode ? '#6B7280' : '#4B5563' },
  bottomSpacing: { height: 30 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: isDarkMode ? '#fff' : '#1F2937', fontSize: 16, marginTop: 12 },
});

export default MyProfileEditScreen;
